import type {
  Condition,
  Decision,
  DecisionValue,
  Evidence,
  FilterPlan,
  Fixture,
  FixtureStats,
  MetricCondition,
} from "../domain/schemas";
import { estimateMatch, type MatchEstimate, probOver, probUnder } from "../football/poisson";
import { computeTeamProfile, MIN_MATCHES, type TeamProfile, venueSplit } from "../football/stats";
import { basicNormalize, namesRefersToSameTeam } from "../football/team-names";
import { formatMetricValue, getMetric, type MetricId } from "./metrics";

/**
 * FILTERING ENGINE
 *
 * Deterministic: given the same fixtures, plan and statistics, it always makes
 * the same decisions. The language model only translates the instruction into
 * a plan; it never decides a fixture's fate on its own.
 *
 * Three-valued logic: every condition evaluates to true, false or null
 * (unknown — data missing). Unknown never silently removes a fixture: it
 * leads to NEEDS_REVIEW.
 */

type Tri = boolean | null;

export interface FixtureContext {
  fixture: Fixture;
  stats: FixtureStats | null;
  home: TeamProfile | null;
  away: TeamProfile | null;
  estimate: MatchEstimate | null;
}

interface EvalResult {
  value: Tri;
  evidence: Evidence[];
  missing: string[];
}

export function buildContext(fixture: Fixture, stats: FixtureStats | null): FixtureContext {
  const usable = (t: FixtureStats["home"] | undefined) =>
    t && t.resolution.status === "matched" && t.recent.length >= MIN_MATCHES ? computeTeamProfile(t.recent) : null;
  const home = usable(stats?.home);
  const away = usable(stats?.away);
  const estimate = home && away ? estimateMatch(home, away) : null;
  return { fixture, stats, home, away, estimate };
}

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

/** Returns the metric value for one side, or null with a reason. */
export function teamMetricValue(
  ctx: FixtureContext,
  metric: MetricId,
  side: "home" | "away",
): { value: number | null; sample: number | null; why?: string } {
  const profile = side === "home" ? ctx.home : ctx.away;
  const teamStats = side === "home" ? ctx.stats?.home : ctx.stats?.away;
  const name = teamLabel(ctx, side);

  if (!ctx.stats) return { value: null, sample: null, why: `No football statistics retrieved for ${name}.` };
  if (teamStats && teamStats.resolution.status !== "matched") {
    return { value: null, sample: null, why: `${name} could not be reliably identified (${teamStats.resolution.status.replace("_", " ")}).` };
  }
  if (!profile) {
    const n = teamStats?.recent.length ?? 0;
    return { value: null, sample: n, why: `Only ${n} recent finished matches found for ${name} (need ${MIN_MATCHES}).` };
  }

  const est = ctx.estimate;
  const modelValue = (v: number | undefined) =>
    est && v !== undefined
      ? { value: v, sample: side === "home" ? est.sampleHome : est.sampleAway }
      : { value: null, sample: null, why: "Probability model needs data for both teams." };

  const { split } = venueSplit(profile, side);
  switch (metric) {
    case "scoring_probability": return modelValue(side === "home" ? est?.pHomeScores : est?.pAwayScores);
    case "clean_sheet_probability": return modelValue(side === "home" ? est?.pHomeCleanSheet : est?.pAwayCleanSheet);
    case "win_probability": return modelValue(side === "home" ? est?.pHomeWin : est?.pAwayWin);
    case "win_to_nil_probability": return modelValue(side === "home" ? est?.pHomeWinToNil : est?.pAwayWinToNil);
    case "goals_scored_avg": return { value: split.avgFor, sample: split.played };
    case "goals_conceded_avg": return { value: split.avgAgainst, sample: split.played };
    case "failed_to_score_rate": return { value: split.failedToScoreRate, sample: split.played };
    case "clean_sheet_rate": return { value: split.cleanSheetRate, sample: split.played };
    case "btts_rate": return { value: split.bttsRate, sample: split.played };
    case "over_2_5_rate": return { value: split.over25Rate, sample: split.played };
    case "form_points_per_game": return { value: profile.formPointsPerGame, sample: profile.formSample };
    default: return { value: null, sample: null, why: `Metric ${metric} is not a team metric.` };
  }
}

export function matchMetricValue(ctx: FixtureContext, metric: MetricId, line?: number | null): { value: number | null; sample: number | null; why?: string } {
  const est = ctx.estimate;
  if (!est) {
    // Explain exactly which team lacks data and why (unidentified, too few matches, …).
    const reasons = (["home", "away"] as const)
      .filter((s) => !(s === "home" ? ctx.home : ctx.away))
      .map((s) => teamMetricValue(ctx, "goals_scored_avg", s).why)
      .filter(Boolean);
    return { value: null, sample: null, why: reasons.join(" ") || "Probability model unavailable for this fixture." };
  }
  const sample = Math.min(est.sampleHome, est.sampleAway);
  switch (metric) {
    case "btts_probability": return { value: est.pBtts, sample };
    case "draw_probability": return { value: est.pDraw, sample };
    case "expected_total_goals": return { value: est.lambdaHome + est.lambdaAway, sample };
    case "over_goals_probability": return { value: probOver(est, line ?? 2.5), sample };
    case "under_goals_probability": return { value: probUnder(est, line ?? 2.5), sample };
    default: return { value: null, sample: null, why: `Metric ${metric} is not a match metric.` };
  }
}

function metricLabel(c: MetricCondition) {
  const def = getMetric(c.metric);
  const base = def?.label ?? c.metric;
  return c.line ? base.replace("X", String(c.line)) : base;
}

function evalMetric(c: MetricCondition, ctx: FixtureContext): EvalResult {
  const def = getMetric(c.metric);
  const source = def?.source ?? "historical_match_data";
  const evidence: Evidence[] = [];
  const missing: string[] = [];

  const one = (subjectLabel: string, r: { value: number | null; sample: number | null; why?: string }): Tri => {
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
    });
    if (r.value === null && r.why) missing.push(r.why);
    return passed;
  };

  if (def?.scope === "match" || c.subject === "match") {
    const value = one("match", matchMetricValue(ctx, c.metric, c.line));
    return { value, evidence, missing };
  }
  const sides: ("home" | "away")[] = c.subject === "home" ? ["home"] : c.subject === "away" ? ["away"] : ["home", "away"];
  const results = sides.map((s) => one(`${s}: ${teamLabel(ctx, s)}`, teamMetricValue(ctx, c.metric, s)));
  const value = c.subject === "either" ? or(results) : and(results);
  return { value, evidence, missing };
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
        evidence: [{
          metric: "team",
          label: `Involves ${c.teams.join(", ")}`,
          subject: c.subject,
          value: null,
          display: hit ? `Yes (${hit})` : "No",
          comparator: null,
          threshold: null,
          passed: Boolean(hit),
          source: "screenshot_text",
          sampleSize: null,
        }],
        missing: [],
      };
    }
    case "competition": {
      const comp = ctx.fixture.competition;
      if (!comp) {
        return {
          value: null,
          evidence: [{ metric: "competition", label: `Competition is ${c.competitions.join(" / ")}`, subject: "match", value: null, display: "Not visible", comparator: null, threshold: null, passed: null, source: "screenshot_text", sampleSize: null }],
          missing: ["The competition was not visible in the screenshot. Add it on the analysis page."],
        };
      }
      const nc = basicNormalize(comp);
      const hit = c.competitions.find((x) => {
        const nx = basicNormalize(x);
        return nx === nc || nc.includes(nx) || nx.includes(nc);
      });
      return {
        value: Boolean(hit),
        evidence: [{ metric: "competition", label: `Competition is ${c.competitions.join(" / ")}`, subject: "match", value: null, display: comp, comparator: null, threshold: null, passed: Boolean(hit), source: "screenshot_text", sampleSize: null }],
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

function describe(e: Evidence) {
  if (e.comparator && e.threshold !== null) {
    const thr = formatMetricValue(e.metric, e.threshold);
    return `${e.label} (${e.subject}) ${e.display} ${e.comparator} ${thr}`;
  }
  return `${e.label}: ${e.display}`;
}

export function evaluateFixture(fixture: Fixture, plan: FilterPlan, stats: FixtureStats | null): Decision {
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
    };
  }
  const ctx = buildContext(fixture, stats);
  const r = plan.removeWhen ? evaluateCondition(plan.removeWhen, ctx) : undefined;
  const k = plan.keepWhen ? evaluateCondition(plan.keepWhen, ctx) : undefined;
  const decision = decide(plan.mode, r?.value, k?.value);

  const evidence = [...(r?.evidence ?? []), ...(k?.evidence ?? [])];
  const missing = Array.from(new Set([...(r?.missing ?? []), ...(k?.missing ?? [])]));
  const reason = buildReason(plan, decision, r, k);

  // Data-completeness confidence (NOT an outcome probability).
  const metricEv = evidence.filter((e) => e.source !== "screenshot_text");
  let confidence: number;
  if (metricEv.length === 0) confidence = 0.95;
  else {
    const have = metricEv.filter((e) => e.value !== null).length / metricEv.length;
    const minSample = Math.min(...metricEv.map((e) => e.sampleSize ?? 0));
    const sampleFactor = Math.min(1, minSample / 10);
    const stale = (stats?.home.stale || stats?.away.stale) ? 0.75 : 1;
    confidence = have * (0.5 + 0.5 * sampleFactor) * stale;
  }
  confidence = Math.round(Math.min(1, confidence * Math.min(1, fixture.confidence + 0.1)) * 100) / 100;

  if (stats?.home.stale || stats?.away.stale) {
    missing.push("Some team data is older than 45 days and may not reflect current form.");
  }

  return { fixtureId: fixture.id, decision, engineDecision: decision, overridden: false, reason, evidence, confidence, missingData: missing };
}

function buildReason(plan: FilterPlan, d: DecisionValue, r?: EvalResult, k?: EvalResult): string {
  const passed = (x?: EvalResult) => (x?.evidence ?? []).filter((e) => e.passed === true).map(describe);
  const failed = (x?: EvalResult) => (x?.evidence ?? []).filter((e) => e.passed === false).map(describe);
  if (d === "NEEDS_REVIEW") {
    const miss = [...(r?.missing ?? []), ...(k?.missing ?? [])];
    return `Could not decide reliably: ${miss[0] ?? "required data is missing"}`;
  }
  if (plan.mode === "remove_matching") {
    if (d === "REMOVE") return `Meets your removal criteria: ${passed(r).join("; ") || "conditions satisfied"}.`;
    if (k?.value === true) return `Kept by your retention rule: ${passed(k).join("; ")}.`;
    return `Does not meet your removal criteria${failed(r).length ? `: ${failed(r).join("; ")}` : ""}.`;
  }
  if (d === "REMOVE") {
    if (r?.value === true) return `Excluded by your removal rule: ${passed(r).join("; ")}.`;
    return `Does not meet your criteria for keeping${failed(k).length ? `: ${failed(k).join("; ")}` : ""}.`;
  }
  return `Meets your criteria for keeping: ${passed(k).join("; ") || "conditions satisfied"}.`;
}

/** Which metrics does a plan need? Used to skip unnecessary API calls. */
export function planNeedsStatistics(plan: FilterPlan): boolean {
  const walk = (c: Condition | null): boolean => {
    if (!c) return false;
    if (c.kind === "metric") return true;
    if (c.kind === "group") return c.conditions.some(walk);
    if (c.kind === "not") return walk(c.condition);
    return false;
  };
  return walk(plan.removeWhen) || walk(plan.keepWhen);
}
