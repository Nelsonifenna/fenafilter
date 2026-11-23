/**
 * The catalogue of metrics the filtering engine can actually compute.
 *
 * The instruction parser may ONLY reference metrics in this list. Anything a
 * user asks for that cannot be mapped here (e.g. "referee is strict",
 * "corners") is reported back as unsupported instead of being guessed.
 */
export type MetricScope = "team" | "match";
export type MetricSource = "historical_match_data" | "model_estimate";

export interface MetricDef {
  id: string;
  scope: MetricScope;
  label: string;
  /** "probability" and "rate" are 0..1, displayed as %. */
  unit: "probability" | "rate" | "goals" | "points";
  source: MetricSource;
  description: string;
  needsLine?: boolean;
}

export const METRICS = [
  // ---- Team metrics (subject: home | away | both | either) ----
  { id: "scoring_probability", scope: "team", label: "Probability team scores", unit: "probability", source: "model_estimate", description: "Estimated chance that the team scores at least one goal in this fixture." },
  { id: "clean_sheet_probability", scope: "team", label: "Probability team keeps a clean sheet", unit: "probability", source: "model_estimate", description: "Estimated chance that the opponent does not score." },
  { id: "win_probability", scope: "team", label: "Win probability", unit: "probability", source: "model_estimate", description: "Estimated chance that the team wins." },
  { id: "win_to_nil_probability", scope: "team", label: "Win-to-nil probability", unit: "probability", source: "model_estimate", description: "Estimated chance that the team wins without conceding." },
  { id: "goals_scored_avg", scope: "team", label: "Goals scored per game", unit: "goals", source: "historical_match_data", description: "Average goals scored in recent matches at this venue (home team: home games, away team: away games)." },
  { id: "goals_conceded_avg", scope: "team", label: "Goals conceded per game", unit: "goals", source: "historical_match_data", description: "Average goals conceded in recent matches at this venue." },
  { id: "failed_to_score_rate", scope: "team", label: "Failed-to-score rate", unit: "rate", source: "historical_match_data", description: "Share of recent matches at this venue in which the team did not score." },
  { id: "clean_sheet_rate", scope: "team", label: "Clean-sheet rate", unit: "rate", source: "historical_match_data", description: "Share of recent matches at this venue without conceding." },
  { id: "btts_rate", scope: "team", label: "BTTS rate (team's matches)", unit: "rate", source: "historical_match_data", description: "Share of the team's recent matches at this venue where both sides scored." },
  { id: "over_2_5_rate", scope: "team", label: "Over 2.5 rate (team's matches)", unit: "rate", source: "historical_match_data", description: "Share of the team's recent matches at this venue with 3+ goals." },
  { id: "form_points_per_game", scope: "team", label: "Recent form (points per game)", unit: "points", source: "historical_match_data", description: "Points per game over the most recent matches in all competitions (3 win, 1 draw)." },
  // ---- Match metrics (subject: match) ----
  { id: "btts_probability", scope: "match", label: "Both teams to score probability", unit: "probability", source: "model_estimate", description: "Estimated chance that both teams score." },
  { id: "over_goals_probability", scope: "match", label: "Over X goals probability", unit: "probability", source: "model_estimate", description: "Estimated chance that total goals go over the line.", needsLine: true },
  { id: "under_goals_probability", scope: "match", label: "Under X goals probability", unit: "probability", source: "model_estimate", description: "Estimated chance that total goals stay under the line.", needsLine: true },
  { id: "draw_probability", scope: "match", label: "Draw probability", unit: "probability", source: "model_estimate", description: "Estimated chance of a draw." },
  { id: "expected_total_goals", scope: "match", label: "Expected total goals", unit: "goals", source: "model_estimate", description: "Expected goals for both teams combined." },
] as const satisfies readonly MetricDef[];

export type MetricId = (typeof METRICS)[number]["id"];
export const METRIC_IDS = METRICS.map((m) => m.id) as [MetricId, ...MetricId[]];
export const TEAM_METRIC_IDS = METRICS.filter((m) => m.scope === "team").map((m) => m.id);
export const MATCH_METRIC_IDS = METRICS.filter((m) => m.scope === "match").map((m) => m.id);

export function getMetric(id: string): MetricDef | undefined {
  return (METRICS as readonly MetricDef[]).find((m) => m.id === id);
}

export function formatMetricValue(id: string, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  const def = getMetric(id);
  if (!def) return String(value);
  if (def.unit === "probability" || def.unit === "rate") return `${Math.round(value * 100)}%`;
  return value.toFixed(2);
}
