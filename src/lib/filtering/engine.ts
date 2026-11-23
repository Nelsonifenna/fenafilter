import type {
  Check,
  Condition,
  Decision,
  DecisionValue,
  Evidence,
  FilterPlan,
  Fixture,
  FixtureStats,
  MetricCondition,
  RecentMatch,
} from "../domain/schemas";
import { h2hFigures, leagueOverRate, MIN_H2H_MEETINGS, MIN_LEAGUE_MATCHES } from "../football/context";
import { estimateMatch, type MatchEstimate, probOver, probUnder } from "../football/poisson";
import { computeSplit, computeTeamProfile, FORM_WINDOW, MIN_MATCHES, type TeamProfile } from "../football/stats";
import { basicNormalize, namesRefersToSameTeam } from "../football/team-names";
import { formatMetricValue, getMetric, type MetricId } from "./metrics";
import { describeCondition } from "./plan-validation";

/**
 * FILTERING ENGINE (playbook evaluation)
 *
 * Deterministic: given the same fixtures, plan and statistics, it always makes
 * the same decisions. The language model only translates the instruction into
 * a plan; it never decides a fixture's fate and never supplies evidence.
 *
 * Three-valued logic: every condition evaluates to true, false or null
 * (unknown — data missing or sample too small). Unknown never silently removes
 * a fixture: it leads to NEEDS_REVIEW.
 *
 * Every figure comes from real finished matches (team history, previous
 * meetings, the league's season) or from the documented goal model built on
 * them. Historical frequencies and model estimates are labelled separately.
 */

type Tri = boolean | null;

export interface FixtureContext {
  fixture: Fixture;
  stats: FixtureStats | null;
  home: TeamProfile | null;
  away: TeamProfile | null;
  estimate: MatchEstimate | null;
  /** Smallest sample a historical figure may rest on (plan.minSample, default 5). */
  minSample: number;
}

interface EvalResult {
  value: Tri;
  evidence: Evidence[];
  missing: string[];
}

interface MetricValue {
  value: number | null;
  sample: number | null;
  why?: string;
  basis?: string | null;
  asOf?: string | null;
}

export function buildContext(fixture: Fixture, stats: FixtureStats | null, plan?: Pick<FilterPlan, "minSample">): FixtureContext {
  const minSample = plan?.minSample ?? MIN_MATCHES;
  const usable = (t: FixtureStats["home"] | undefined) =>
    t && t.resolution.status === "matched" && t.recent.length >= minSample ? computeTeamProfile(t.recent) : null;
  const home = usable(stats?.home);
  const away = usable(stats?.away);
  const ls = stats?.leagueStats;
  const priors =
    ls && ls.matches >= MIN_LEAGUE_MATCHES && stats?.league
      ? { home: ls.homeGoalsAvg, away: ls.awayGoalsAvg, label: `${stats.league.name} ${seasonLabel(stats.league.season)}` }
      : null;
  const estimate = home && away ? estimateMatch(home, away, priors) : null;
  return { fixture, stats, home, away, estimate, minSample };
}

const seasonLabel = (season: number) => `${season}/${String(season + 1).slice(-2)}`;

/* ---------------------------- tri-logic ---------------------------- */

function and(values: Tri[]): Tri {
  if (values.some((v) => v === false)) return false;
  if (values.some((v) => v === null)) return null;
  return true;
}
function or(values: Tri[]): Tri {
  if (values.some((v) => v === true)) return true;
  if (values.some((v) => v === null)) return null;
  return false;
}
function compare(a: number, cmp: string, b: number): boolean {
  switch (cmp) {
    case ">=": return a >= b - 1e-9;
    case "<=": return a <= b + 1e-9;
    case ">": return a > b;
    case "<": return a < b;
    default: return false;
  }
}

/* --------------------------- metric values ------------------------- */

function teamLabel(ctx: FixtureContext, side: "home" | "away") {
  return side === "home" ? ctx.fixture.homeTeam : ctx.fixture.awayTeam;
}

const sortRecent = (list: RecentMatch[]) => [...list].sort((a, b) => b.date.localeCompare(a.date));

/**
 * Choose the matches a team figure is based on.
 * window "venue" (default): home team's home games / away team's away games;
 * if that sample is too small (and the user did not insist on it) all matches are used, and the evidence says so.
 * lastN: only the most recent N of that window.
 */
function selectMatches(
  ctx: FixtureContext,
  side: "home" | "away",
  window: "venue" | "overall" | undefined,
  lastN: number | undefined,
): { matches: RecentMatch[]; basis: string } | { why: string; sample: number } {
  const team = side === "home" ? ctx.stats?.home : ctx.stats?.away;
  const all = sortRecent(team?.recent ?? []);
  const venueWord = side === "home" ? "home games" : "away games";
  const need = lastN ? Math.min(ctx.minSample, lastN) : ctx.minSample;
  const take = (list: RecentMatch[]) => (lastN ? list.slice(0, lastN) : list);
  const suffix = lastN ? `, last ${lastN}` : "";

  if ((window ?? "venue") === "venue") {
    const venue = take(all.filter((m) => m.venue === side));
    if (venue.length >= need) return { matches: venue, basis: `${venueWord}${suffix}` };
    if (window === "venue") {
      return { why: `Only ${venue.length} recent ${venueWord} found for ${teamLabel(ctx, side)} (need ${need}).`, sample: venue.length };
    }
    const overall = take(all);
    if (overall.length >= need) return { matches: overall, basis: `all matches${suffix} (only ${venue.length} ${venue.length === 1 ? venueWord.slice(0, -1) : venueWord} available)` };
    return { why: `Only ${overall.length} recent finished matches found for ${teamLabel(ctx, side)} (need ${need}).`, sample: overall.length };
  }
  const overall = take(all);
  if (overall.length >= need) return { matches: overall, basis: `all matches${suffix}` };
  return { why: `Only ${overall.length} recent finished matches found for ${teamLabel(ctx, side)} (need ${need}).`, sample: overall.length };
}

/** Returns the metric value for one side, or null with a reason. */
export function teamMetricValue(
  ctx: FixtureContext,
  metric: MetricId,
  side: "home" | "away",
  opts: { window?: "venue" | "overall"; lastN?: number; line?: number | null } = {},
): MetricValue {
  const profile = side === "home" ? ctx.home : ctx.away;
  const teamStats = side === "home" ? ctx.stats?.home : ctx.stats?.away;
  const name = teamLabel(ctx, side);

  if (!ctx.stats) return { value: null, sample: null, why: `No football statistics retrieved for ${name}.` };
  if (teamStats && teamStats.resolution.status !== "matched") {
    return { value: null, sample: null, why: `${name} could not be reliably identified (${teamStats.resolution.status.replace("_", " ")}).` };
  }
  if (!profile) {
    const n = teamStats?.recent.length ?? 0;
    return { value: null, sample: n, why: `Only ${n} recent finished matches found for ${name} (need ${ctx.minSample}).` };
  }

  const est = ctx.estimate;
  const modelValue = (v: number | undefined): MetricValue =>
    est && v !== undefined
      ? { value: v, sample: side === "home" ? est.sampleHome : est.sampleAway, basis: "goal model", asOf: teamStats?.dataAsOf ?? null }
      : { value: null, sample: null, why: "The goal model needs enough data for both teams." };

  switch (metric) {
    case "scoring_probability": return modelValue(side === "home" ? est?.pHomeScores : est?.pAwayScores);
    case "clean_sheet_probability": return modelValue(side === "home" ? est?.pHomeCleanSheet : est?.pAwayCleanSheet);
    case "win_probability": return modelValue(side === "home" ? est?.pHomeWin : est?.pAwayWin);
    case "win_to_nil_probability": return modelValue(side === "home" ? est?.pHomeWinToNil : est?.pAwayWinToNil);
    case "form_points_per_game": {
      const n = opts.lastN ?? FORM_WINDOW;
      const last = sortRecent(teamStats?.recent ?? []).slice(0, n);
      if (last.length < Math.min(n, ctx.minSample)) return { value: null, sample: last.length, why: `Only ${last.length} recent matches found for ${name}.` };
      const pts = last.reduce((s, m) => s + (m.goalsFor > m.goalsAgainst ? 3 : m.goalsFor === m.goalsAgainst ? 1 : 0), 0);
      return { value: pts / last.length, sample: last.length, basis: `last ${last.length} matches, all competitions`, asOf: last[0]?.date ?? null };
    }
  }

  const sel = selectMatches(ctx, side, opts.window, opts.lastN);
  if ("why" in sel) return { value: null, sample: sel.sample, why: sel.why };
  const m = sel.matches;
  const split = computeSplit(m);
  const line = opts.line ?? 2.5;
  const base = { sample: m.length, basis: sel.basis, asOf: m[0]?.date ?? null };
  switch (metric) {
    case "goals_scored_avg": return { value: split.avgFor, ...base };
    case "goals_conceded_avg": return { value: split.avgAgainst, ...base };
    case "failed_to_score_rate": return { value: split.failedToScoreRate, ...base };
    case "clean_sheet_rate": return { value: split.cleanSheetRate, ...base };
    case "btts_rate": return { value: split.bttsRate, ...base };
    case "over_2_5_rate": return { value: split.over25Rate, ...base };
    case "over_goals_rate": return { value: m.filter((x) => x.goalsFor + x.goalsAgainst > line).length / m.length, ...base };
    case "under_goals_rate": return { value: m.filter((x) => x.goalsFor + x.goalsAgainst < line).length / m.length, ...base };
    case "match_goals_avg": return { value: m.reduce((s, x) => s + x.goalsFor + x.goalsAgainst, 0) / m.length, ...base };
    default: return { value: null, sample: null, why: `Metric ${metric} is not a team metric.` };
  }
}

export function matchMetricValue(ctx: FixtureContext, metric: MetricId, line?: number | null): MetricValue {
  const l = line ?? 2.5;
  const def = getMetric(metric);

  // Previous meetings between the two clubs.
  if (def?.basis === "h2h") {
    const h2h = ctx.stats?.h2h;
    if (!h2h) return { value: null, sample: null, why: "Head-to-head history is not available for this fixture." };
    const f = h2hFigures(h2h);
    if (!f || f.meetings < MIN_H2H_MEETINGS) {
      return { value: null, sample: f?.meetings ?? 0, why: `Only ${f?.meetings ?? 0} previous meetings found (need ${MIN_H2H_MEETINGS}).` };
    }
    const base = { sample: f.meetings, basis: `last ${f.meetings} meetings`, asOf: h2h.dataAsOf };
    if (metric === "h2h_btts_rate") return { value: f.bttsRate, ...base };
    if (metric === "h2h_avg_goals") return { value: f.avgGoals, ...base };
    return { value: f.overRate(l), ...base };
  }

  // League-wide figures for this season.
  if (def?.basis === "league") {
    const league = ctx.stats?.league;
    const ls = ctx.stats?.leagueStats;
    if (!league) return { value: null, sample: null, why: "The league for this fixture could not be identified." };
    if (!ls) return { value: null, sample: null, why: `League figures for ${league.name} are not available.` };
    if (ls.matches < MIN_LEAGUE_MATCHES) {
      return { value: null, sample: ls.matches, why: `Only ${ls.matches} ${league.name} matches played this season (need ${MIN_LEAGUE_MATCHES}).` };
    }
    const base = { sample: ls.matches, basis: `${league.name} ${seasonLabel(league.season)}`, asOf: ls.dataAsOf };
    if (metric === "league_avg_goals") return { value: ls.avgGoals, ...base };
    if (metric === "league_btts_rate") return { value: ls.bttsRate, ...base };
    const rate = leagueOverRate(ls, l);
    return rate === null ? { value: null, sample: ls.matches, why: `League over/under figures are available for 0.5, 1.5, 2.5 and 3.5 goals only.` } : { value: rate, ...base };
  }

  // Both clubs' own records, combined.
  if (def?.basis === "combined") {
    const metricFor: MetricId = metric === "combined_btts_rate" ? "btts_rate" : "over_goals_rate";
    const h = teamMetricValue(ctx, metricFor, "home", { line: l });
    const a = teamMetricValue(ctx, metricFor, "away", { line: l });
    if (h.value === null || a.value === null) return { value: null, sample: null, why: h.why ?? a.why ?? "Not enough data for both teams." };
    const asOf = [h.asOf, a.asOf].filter(Boolean).sort().at(-1) ?? null;
    return { value: (h.value + a.value) / 2, sample: Math.min(h.sample ?? 0, a.sample ?? 0), basis: `home team ${h.basis}, away team ${a.basis}`, asOf };
  }

  // Goal-model estimates.
  const est = ctx.estimate;
  if (!est) {
    const reasons = (["home", "away"] as const)
      .filter((s) => !(s === "home" ? ctx.home : ctx.away))
      .map((s) => teamMetricValue(ctx, "goals_scored_avg", s).why)
      .filter(Boolean);
    return { value: null, sample: null, why: reasons.join(" ") || "The goal model is unavailable for this fixture." };
  }
  const base = { sample: Math.min(est.sampleHome, est.sampleAway), basis: "goal model", asOf: ctx.stats?.home.dataAsOf ?? null };
  switch (metric) {
    case "btts_probability": return { value: est.pBtts, ...base };
    case "draw_probability": return { value: est.pDraw, ...base };
    case "expected_total_goals": return { value: est.lambdaHome + est.lambdaAway, ...base };
    case "over_goals_probability": return { value: probOver(est, l), ...base };
    case "under_goals_probability": return { value: probUnder(est, l), ...base };
    default: return { value: null, sample: null, why: `Metric ${metric} is not a match metric.` };
  }
}

function metricLabel(c: MetricCondition) {
  const def = getMetric(c.metric);
  const base = def?.label ?? c.metric;
  return def?.needsLine ? base.replace("X", String(c.line ?? 2.5)) : base;
}

function evalMetric(c: MetricCondition, ctx: FixtureContext): EvalResult {
  const def = getMetric(c.metric);
  const source = def?.source ?? "historical_match_data";
  const evidence: Evidence[] = [];
  const missing: string[] = [];

  const one = (subjectLabel: string, r: MetricValue): Tri => {
    const passed = r.value === null ? null : compare(r.value, c.comparator, c.value);
    evidence.push({
      metric: c.metric,
      label: metricLabel(c),
      subject: subjectLabel,
      value: r.value,
      display: formatMetricValue(c.metric, r.value),
      comparator: c.comparator,
      threshold: c.value,
      passed,
      source,
      sampleSize: r.sample,
      basis: r.basis ?? null,
      asOf: r.asOf ?? null,
    });
    if (r.value === null && r.why) missing.push(r.why);
    return passed;
  };

  if (def?.scope === "match" || c.subject === "match") {
    const value = one("match", matchMetricValue(ctx, c.metric, c.line));
    return { value, evidence, missing };
  }
  const sides: ("home" | "away")[] = c.subject === "home" ? ["home"] : c.subject === "away" ? ["away"] : ["home", "away"];
  const results = sides.map((s) => one(`${s}: ${teamLabel(ctx, s)}`, teamMetricValue(ctx, c.metric, s, { window: c.window, lastN: c.lastN, line: c.line })));
  const value = c.subject === "either" ? or(results) : and(results);
  return { value, evidence, missing };
}

/** The competition a fixture belongs to: the screenshot text and, when identified, the real league. */
function competitionNames(ctx: FixtureContext): string[] {
  return [ctx.fixture.competition, ctx.stats?.league?.name].filter((x): x is string => Boolean(x));
}

export function evaluateCondition(c: Condition, ctx: FixtureContext, depth = 0): EvalResult {
  if (depth > 6) return { value: null, evidence: [], missing: ["Instruction is nested too deeply."] };
  switch (c.kind) {
    case "metric":
      return evalMetric(c, ctx);
    case "team": {
      const names = c.subject === "home" ? [ctx.fixture.homeTeam] : c.subject === "away" ? [ctx.fixture.awayTeam] : [ctx.fixture.homeTeam, ctx.fixture.awayTeam];
      const resolved = [
        c.subject !== "away" ? ctx.stats?.home.resolution.team?.name : undefined,
        c.subject !== "home" ? ctx.stats?.away.resolution.team?.name : undefined,
      ].filter((x): x is string => Boolean(x));
      const all = [...names, ...resolved];
      const hit = c.teams.find((t) => all.some((n) => namesRefersToSameTeam(n, t)));
      return {
        value: Boolean(hit),
        evidence: [{ metric: "team", label: `Involves ${c.teams.join(", ")}`, subject: c.subject, value: null, display: hit ? `Yes (${hit})` : "No", comparator: null, threshold: null, passed: Boolean(hit), source: "screenshot_text", sampleSize: null }],
        missing: [],
      };
    }
    case "competition": {
      const names = competitionNames(ctx);
      const label = `Competition is ${c.competitions.join(" or ")}`;
      if (names.length === 0) {
        return {
          value: null,
          evidence: [{ metric: "competition", label, subject: "match", value: null, display: "Unknown", comparator: null, threshold: null, passed: null, source: "screenshot_text", sampleSize: null }],
          missing: ["The competition was not visible in the screenshot and could not be identified. Add it on the analysis page."],
        };
      }
      const hit = c.competitions.find((x) => {
        const nx = basicNormalize(x);
        return names.some((n) => {
          const nc = basicNormalize(n);
          return nx === nc || nc.includes(nx) || nx.includes(nc);
        });
      });
      return {
        value: Boolean(hit),
        evidence: [{ metric: "competition", label, subject: "match", value: null, display: names.join(" · "), comparator: null, threshold: null, passed: Boolean(hit), source: "screenshot_text", sampleSize: null }],
        missing: [],
      };
    }
    case "group": {
      const parts = c.conditions.map((x) => evaluateCondition(x, ctx, depth + 1));
      return {
        value: c.operator === "AND" ? and(parts.map((p) => p.value)) : or(parts.map((p) => p.value)),
        evidence: parts.flatMap((p) => p.evidence),
        missing: parts.flatMap((p) => p.missing),
      };
    }
    case "not": {
      const inner = evaluateCondition(c.condition, ctx, depth + 1);
      return { ...inner, value: inner.value === null ? null : !inner.value };
    }
  }
}

/* ----------------------------- decisions --------------------------- */

export function decide(mode: FilterPlan["mode"], removeWhen: Tri | undefined, keepWhen: Tri | undefined): DecisionValue {
  const hasR = removeWhen !== undefined;
  const hasK = keepWhen !== undefined;
  if (mode === "remove_matching") {
    if (hasK && keepWhen === true) return "KEEP"; // explicit retention exception
    if (!hasR || removeWhen === false) return "KEEP";
    if (removeWhen === true && (!hasK || keepWhen === false)) return "REMOVE";
    return "NEEDS_REVIEW";
  }
  // keep_only_matching
  if (hasR && removeWhen === true) return "REMOVE";
  if (!hasK || keepWhen === false) return hasK ? "REMOVE" : "KEEP";
  if (keepWhen === true && (!hasR || removeWhen === false)) return "KEEP";
  return "NEEDS_REVIEW";
}

const CMP_GLYPH: Record<string, string> = { ">=": "≥", "<=": "≤" };

function describe(e: Evidence) {
  if (e.comparator && e.threshold !== null) {
    const thr = formatMetricValue(e.metric, e.threshold);
    const who = e.subject === "match" ? "" : ` (${e.subject.replace(/^(home|away): /, "")})`;
    const rule = `${CMP_GLYPH[e.comparator] ?? e.comparator} ${thr}`;
    // Not-met figures must not read like a true comparison ("3.00 ≤ 2.00").
    return e.passed === false ? `${e.label}${who} ${e.display}, not ${rule}` : `${e.label}${who} ${e.display} ${rule}`;
  }
  return `${e.label}: ${e.display}`;
}

/** A rule's top-level criteria: the children of a top-level group, or the single condition. */
interface Criterion {
  label: string;
  result: EvalResult;
}

function criteria(rule: Condition, ctx: FixtureContext): { value: Tri; items: Criterion[]; operator: "AND" | "OR" } {
  const parts = rule.kind === "group" ? rule.conditions : [rule];
  const operator = rule.kind === "group" ? rule.operator : "AND";
  const items = parts.map((p) => ({ label: criterionLabel(p), result: evaluateCondition(p, ctx, 1) }));
  const vals = items.map((i) => i.result.value);
  return { value: operator === "AND" ? and(vals) : or(vals), items, operator };
}

function criterionLabel(c: Condition): string {
  const phrase = c.kind === "metric" || c.kind === "team" || c.kind === "competition" ? c.sourcePhrase : undefined;
  return phrase?.trim() || describeCondition(c);
}

const toCheck = (rule: "remove" | "keep", c: Criterion): Check => ({
  rule,
  label: c.label,
  result: c.result.value === true ? "met" : c.result.value === false ? "not_met" : "unknown",
});

const firstEvidence = (c: Criterion, passed: boolean | null) => c.result.evidence.find((e) => e.passed === passed && e.comparator) ?? c.result.evidence.find((e) => e.passed === passed);

function because(c: Criterion, passed: boolean | null) {
  const e = firstEvidence(c, passed);
  return `“${c.label}”${e ? ` (${describe(e)})` : ""}`;
}

/** A row whose team names could not be read reliably: never filtered automatically. */
export function fixtureUnreadable(fixture: Pick<Fixture, "homeTeam" | "awayTeam" | "issues">): boolean {
  if (!fixture.homeTeam.trim() || !fixture.awayTeam.trim()) return true;
  return fixture.issues.some((i) => /could not be read|unreadable/i.test(i));
}

export function evaluateFixture(fixture: Fixture, plan: FilterPlan, stats: FixtureStats | null): Decision {
  if (!fixture.excluded && fixtureUnreadable(fixture)) {
    return {
      fixtureId: fixture.id,
      decision: "NEEDS_REVIEW",
      engineDecision: "NEEDS_REVIEW",
      overridden: false,
      reason: "Review: the team names in this row could not be read reliably. Correct them to include this match in the filtering.",
      evidence: [],
      confidence: 0,
      missingData: ["Team names could not be read reliably from the screenshot."],
      checks: [],
    };
  }
  if (fixture.excluded) {
    return {
      fixtureId: fixture.id,
      decision: "KEEP",
      engineDecision: "KEEP",
      overridden: false,
      reason: "Marked as not a fixture, so it is left untouched in the image.",
      evidence: [],
      confidence: 1,
      missingData: [],
      checks: [],
    };
  }
  const ctx = buildContext(fixture, stats, plan);
  const r = plan.removeWhen ? criteria(plan.removeWhen, ctx) : undefined;
  const k = plan.keepWhen ? criteria(plan.keepWhen, ctx) : undefined;
  const decision = decide(plan.mode, r?.value, k?.value);

  const all = [...(r?.items ?? []), ...(k?.items ?? [])];
  const evidence = [
    ...(r?.items ?? []).flatMap((c) => c.result.evidence.map((e) => ({ ...e, rule: "remove" as const }))),
    ...(k?.items ?? []).flatMap((c) => c.result.evidence.map((e) => ({ ...e, rule: "keep" as const }))),
  ];
  const missing = Array.from(new Set(all.flatMap((c) => c.result.missing)));
  const checks = [...(r?.items ?? []).map((c) => toCheck("remove", c)), ...(k?.items ?? []).map((c) => toCheck("keep", c))];
  const reason = buildReason(plan, decision, r, k);

  // Data-completeness confidence (NOT an outcome probability).
  const metricEv = evidence.filter((e) => e.source !== "screenshot_text");
  let confidence: number;
  if (metricEv.length === 0) confidence = 0.95;
  else {
    const have = metricEv.filter((e) => e.value !== null).length / metricEv.length;
    const minSample = Math.min(...metricEv.map((e) => e.sampleSize ?? 0));
    const sampleFactor = Math.min(1, minSample / 10);
    const stale = stats?.home.stale || stats?.away.stale ? 0.75 : 1;
    confidence = have * (0.5 + 0.5 * sampleFactor) * stale;
  }
  confidence = Math.round(Math.min(1, confidence * Math.min(1, fixture.confidence + 0.1)) * 100) / 100;

  if (stats?.home.stale || stats?.away.stale) {
    missing.push("Some team data is older than 45 days and may not reflect current form.");
  }

  return { fixtureId: fixture.id, decision, engineDecision: decision, overridden: false, reason, evidence, confidence, missingData: missing, checks };
}

type RuleEval = ReturnType<typeof criteria>;

function buildReason(plan: FilterPlan, d: DecisionValue, r?: RuleEval, k?: RuleEval): string {
  const met = (x?: RuleEval) => (x?.items ?? []).filter((c) => c.result.value === true);
  const notMet = (x?: RuleEval) => (x?.items ?? []).filter((c) => c.result.value === false);
  const unknown = (x?: RuleEval) => (x?.items ?? []).filter((c) => c.result.value === null);
  const list = (cs: Criterion[], passed: boolean | null) => cs.map((c) => because(c, passed)).join(" and ");

  if (d === "NEEDS_REVIEW") {
    const u = [...unknown(r), ...unknown(k)][0];
    const why = u?.result.missing[0] ?? "required data is missing";
    return u ? `Review: “${u.label}” could not be checked — ${why}` : `Review: ${why}`;
  }
  if (plan.mode === "remove_matching") {
    if (d === "REMOVE") return `Removed: meets your removal criteria ${list(r?.operator === "OR" ? met(r).slice(0, 1) : met(r), true)}.`;
    if (k?.value === true) return `Kept: meets your exception ${list(met(k).slice(0, 1), true)}.`;
    const nm = notMet(r);
    return nm.length ? `Kept: does not meet your removal criteria ${list(nm.slice(0, 2), false)}.` : "Kept: none of your removal criteria apply.";
  }
  if (d === "REMOVE") {
    if (r?.value === true) return `Removed: meets your exclusion ${list(met(r).slice(0, 1), true)}.`;
    return `Removed: does not meet ${list(notMet(k).slice(0, 2), false) || "your criteria for keeping"}.`;
  }
  return `Kept: meets your criteria ${list(k?.operator === "OR" ? met(k).slice(0, 1) : met(k), true)}.`;
}

/* --------------------------- data needs --------------------------- */

export interface DataNeeds {
  /** Team identification and recent matches. */
  teams: boolean;
  /** Previous meetings between the clubs. */
  h2h: boolean;
  /** League identification and league-wide season figures. */
  league: boolean;
  /** Competition rules: identify the league only for fixtures whose competition is not visible. */
  competitionLookup: boolean;
}

/** Which data does a plan need? Used to avoid unnecessary statistics requests. */
export function planDataNeeds(plan: FilterPlan): DataNeeds {
  const needs: DataNeeds = { teams: false, h2h: false, league: false, competitionLookup: false };
  const walk = (c: Condition | null): void => {
    if (!c) return;
    if (c.kind === "group") return c.conditions.forEach(walk);
    if (c.kind === "not") return walk(c.condition);
    if (c.kind === "competition") {
      needs.competitionLookup = true;
      return;
    }
    if (c.kind !== "metric") return;
    const def = getMetric(c.metric);
    if (def?.basis === "h2h") needs.h2h = needs.teams = true;
    else if (def?.basis === "league") needs.league = needs.teams = true;
    else if (def?.source === "model_estimate") needs.teams = needs.league = true; // league averages anchor the goal model
    else needs.teams = true;
  };
  walk(plan.removeWhen);
  walk(plan.keepWhen);
  return needs;
}

export function planNeedsStatistics(plan: FilterPlan): boolean {
  const n = planDataNeeds(plan);
  return n.teams || n.h2h || n.league || n.competitionLookup;
}

/** Does this particular fixture need statistics requests under the plan? */
export function fixtureNeedsStatistics(needs: DataNeeds, fixture: Pick<Fixture, "competition" | "excluded">): boolean {
  if (fixture.excluded) return false;
  return needs.teams || needs.h2h || needs.league || (needs.competitionLookup && !fixture.competition);
}
