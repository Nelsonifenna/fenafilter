import type { Decision, DecisionValue, Evidence, FilterPlan, Fixture } from "./domain/schemas";
import { formatMetricValue } from "./filtering/metrics";

/**
 * Plain-language explanations built ONLY from the engine's real evidence.
 * Nothing here adds facts: every number comes from an Evidence record, and
 * historical figures are described as past results, never as certainties.
 */

const CMP_WORDS: Record<string, string> = { ">=": "at least", "<=": "at most", ">": "more than", "<": "less than" };
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

function teamOf(e: Evidence) {
  return e.subject.replace(/^(home|away): /, "");
}

/** "away games, last 6" → "away games"; "all matches (only 2 home games available)" → "matches". */
function windowWord(e: Evidence) {
  const b = e.basis ?? "";
  if (b.startsWith("home games")) return "home games";
  if (b.startsWith("away games")) return "away games";
  return "matches";
}

const lineOf = (e: Evidence) => e.label.match(/(\d+\.5)/)?.[1] ?? "2.5";
const pct = (e: Evidence) => formatMetricValue(e.metric, e.value);
const num = (e: Evidence) => (e.value === null ? "n/a" : e.value.toFixed(2));
const n = (e: Evidence) => e.sampleSize ?? 0;
const plural = (k: number, one: string, many: string) => (k === 1 ? one : many);

/** One sentence describing what a piece of evidence shows (without the threshold). */
export function describeEvidence(e: Evidence): string | null {
  if (e.metric === "team") return e.passed ? `the match involves ${e.display.replace(/^Yes \((.*)\)$/, "$1")}` : null;
  if (e.metric === "competition") return e.display === "Unknown" ? null : `the competition is ${e.display}`;
  if (e.value === null) return null;
  const t = teamOf(e);
  const last = `last ${n(e)} ${windowWord(e)}`;
  switch (e.metric) {
    case "goals_scored_avg": return `${t} has averaged ${num(e)} goals per game in its ${last}`;
    case "goals_conceded_avg": return `${t} has conceded ${num(e)} goals per game in its ${last}`;
    case "failed_to_score_rate": return `${t} failed to score in ${pct(e)} of its ${last}`;
    case "clean_sheet_rate": return `${t} kept a clean sheet in ${pct(e)} of its ${last}`;
    case "btts_rate": return `both teams scored in ${pct(e)} of ${t}'s ${last}`;
    case "over_2_5_rate":
    case "over_goals_rate": return `${pct(e)} of ${t}'s ${last} had more than ${lineOf(e)} goals`;
    case "under_goals_rate": return `${pct(e)} of ${t}'s ${last} had fewer than ${lineOf(e)} goals`;
    case "match_goals_avg": return `${t}'s ${last} averaged ${num(e)} goals in total`;
    case "form_points_per_game": return `${t} has taken ${num(e)} points per game from its last ${n(e)} matches`;
    case "scoring_probability": return `the model gives ${t} a ${pct(e)} chance of scoring`;
    case "clean_sheet_probability": return `the model gives ${t} a ${pct(e)} chance of keeping a clean sheet`;
    case "win_probability": return `the model gives ${t} a ${pct(e)} chance of winning`;
    case "win_to_nil_probability": return `the model gives ${t} a ${pct(e)} chance of winning without conceding`;
    case "btts_probability": return `the model estimates a ${pct(e)} chance that both teams score`;
    case "over_goals_probability": return `the model estimates a ${pct(e)} chance of more than ${lineOf(e)} goals`;
    case "under_goals_probability": return `the model estimates a ${pct(e)} chance of fewer than ${lineOf(e)} goals`;
    case "draw_probability": return `the model estimates a ${pct(e)} chance of a draw`;
    case "expected_total_goals": return `the model expects about ${num(e)} goals in total`;
    case "combined_btts_rate": return `both teams scored in ${pct(e)} of the two clubs' recent matches on average`;
    case "combined_over_goals_rate": return `${pct(e)} of the two clubs' recent matches had more than ${lineOf(e)} goals on average`;
    case "h2h_btts_rate": return `both teams scored in ${pct(e)} of their last ${n(e)} ${plural(n(e), "meeting", "meetings")}`;
    case "h2h_avg_goals": return `their last ${n(e)} ${plural(n(e), "meeting", "meetings")} averaged ${num(e)} goals`;
    case "h2h_over_goals_rate": return `${pct(e)} of their last ${n(e)} meetings had more than ${lineOf(e)} goals`;
    case "league_avg_goals": return `${e.basis ?? "league"} matches have averaged ${num(e)} goals`;
    case "league_btts_rate": return `both teams scored in ${pct(e)} of ${e.basis ?? "league"} matches`;
    case "league_over_goals_rate": return `${pct(e)} of ${e.basis ?? "league"} matches had more than ${lineOf(e)} goals`;
    default: return `${e.label.toLowerCase()} was ${e.display}`;
  }
}

function threshold(e: Evidence) {
  if (!e.comparator || e.threshold === null) return "";
  return `${CMP_WORDS[e.comparator] ?? e.comparator} ${formatMetricValue(e.metric, e.threshold)}`;
}

function withThreshold(e: Evidence, met: boolean) {
  const what = describeEvidence(e);
  if (!what) return null;
  const thr = threshold(e);
  if (!thr) return what;
  return met ? `${what}, meeting your threshold of ${thr}` : `${what}, so it does not meet your threshold of ${thr}`;
}

const pick = (d: Decision, rule: "remove" | "keep", passed: boolean) =>
  d.evidence.find((e) => (e.rule ?? "remove") === rule && e.passed === passed && describeEvidence(e) !== null);

/** Plain review reason ("several clubs match this name" instead of internal status words). */
export function reviewReason(d: Decision): string {
  const raw = d.missingData[0] ?? "Some of the data needed for your rules is not available.";
  return raw
    .replace(/could not be reliably identified \(ambiguous\)\./, "matches several clubs, so FenaFilter could not tell which one is meant.")
    .replace(/could not be reliably identified \(not found\)\./, "could not be found in the football data.")
    .replace(/\(need (\d+)\)/, "— at least $1 are needed for a fair judgement");
}

/** One or two sentences explaining a decision in plain English. */
export function explainDecision(d: Decision, plan: Pick<FilterPlan, "mode"> | null, chosen: DecisionValue = d.decision): string {
  if (d.overridden || chosen !== d.engineDecision) {
    return chosen === "REMOVE" ? "You chose to remove this match." : "You chose to keep this match.";
  }
  if (chosen === "NEEDS_REVIEW") return reviewReason(d);
  const mode = plan?.mode ?? "remove_matching";

  if (chosen === "REMOVE") {
    const hit = pick(d, "remove", true);
    if (hit) return `${cap(withThreshold(hit, true)!)}.`;
    const miss = pick(d, "keep", false);
    if (miss) return `It does not meet your criteria for keeping: ${withThreshold(miss, false)}.`;
    return d.reason;
  }
  // KEEP
  const exception = pick(d, "keep", true);
  if (mode === "remove_matching") {
    if (exception) return `Kept as an exception: ${withThreshold(exception, true)}.`;
    const miss = pick(d, "remove", false);
    if (miss) return `${cap(withThreshold(miss, false)!)}.`;
    return d.evidence.length ? "None of your removal criteria apply to this match." : d.reason.replace(/^Kept: /, "");
  }
  if (exception) return `${cap(withThreshold(exception, true)!)}.`;
  return d.reason.replace(/^Kept: /, "");
}

export interface OutcomeCounts {
  total: number;
  kept: number;
  removed: number;
  review: number;
  leagues: string[];
}

export function countOutcome(fixtures: Fixture[], decisions: Decision[], applied: Record<string, DecisionValue>, leagueOf: (f: Fixture) => string | null): OutcomeCounts {
  const active = fixtures.filter((f) => !f.excluded);
  const ids = new Set(active.map((f) => f.id));
  const ds = decisions.filter((d) => ids.has(d.fixtureId));
  const leagues = [...new Set(active.map(leagueOf).filter((x): x is string => Boolean(x)))];
  return {
    total: active.length,
    kept: ds.filter((d) => applied[d.fixtureId] === "KEEP").length,
    removed: ds.filter((d) => applied[d.fixtureId] === "REMOVE").length,
    review: ds.filter((d) => applied[d.fixtureId] === "NEEDS_REVIEW").length,
    leagues,
  };
}

const matches = (k: number) => `${k} ${plural(k, "match", "matches")}`;

/** The answer-first summary, built only from the actual decisions. */
export function answerSummary(c: OutcomeCounts): string {
  if (c.total === 0) return "No matches were analyzed.";
  const where = c.leagues.length > 1 ? ` across ${c.leagues.length} competitions` : c.leagues.length === 1 ? ` from ${c.leagues[0]}` : "";
  const first = `FenaFilter analyzed ${matches(c.total)}${where}.`;
  const parts = [
    c.kept ? `${matches(c.kept)} ${plural(c.kept, "passes", "pass")} your playbook` : null,
    c.removed ? `${c.removed} ${plural(c.removed, "was", "were")} removed` : null,
    c.review ? `${c.review} ${plural(c.review, "needs", "need")} a closer look` : null,
  ].filter(Boolean) as string[];
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "";
  const tail =
    c.removed === 0
      ? c.review
        ? " Nothing was cut from your screenshot: matches that need a closer look stay in until you decide."
        : " Nothing was cut from your screenshot."
      : c.review
        ? " Matches that need a closer look stay in your screenshot until you decide."
        : "";
  return `${first} ${cap(joined)}.${tail}`;
}
