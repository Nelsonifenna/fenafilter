import { z } from "zod";
import { METRIC_IDS } from "../filtering/metrics";

/* ------------------------------------------------------------------ */
/* Fixtures (from the vision agent, correctable by the user)           */
/* ------------------------------------------------------------------ */

export const BoxSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});
export type Box = z.infer<typeof BoxSchema>;

export const OddSchema = z.object({ label: z.string().max(20), value: z.string().max(20) });

export const FixtureSchema = z.object({
  id: z.string().regex(/^match_\d{3}$/),
  homeTeam: z.string().max(80),
  awayTeam: z.string().max(80),
  competition: z.string().max(80).nullable(),
  date: z.string().max(40).nullable(),
  kickoff: z.string().max(20).nullable(),
  odds: z.array(OddSchema).max(12),
  confidence: z.number().min(0).max(1),
  box: BoxSchema,
  /** Problems found by validation (low confidence, unreadable text, odd box). */
  issues: z.array(z.string().max(200)).max(10),
  userEdited: z.boolean(),
  /** User marked this row as "not a fixture" — it is never removed from the image. */
  excluded: z.boolean(),
  /** API-Football team ids chosen manually by the user when a name was ambiguous. */
  teamIds: z.object({ home: z.number().int().nullable(), away: z.number().int().nullable() }).optional(),
});
export type Fixture = z.infer<typeof FixtureSchema>;

export const ExtractionSchema = z.object({
  model: z.string(),
  layout: z.enum(["list", "grid", "other"]),
  isFootballImage: z.boolean(),
  imageWidth: z.number().int(),
  imageHeight: z.number().int(),
  tiles: z.number().int(),
  fixtures: z.array(FixtureSchema),
  warnings: z.array(z.string()),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/* ------------------------------------------------------------------ */
/* Filter plan (from the instruction parser; validated + user-editable) */
/* ------------------------------------------------------------------ */

export const ComparatorSchema = z.enum([">=", "<=", ">", "<"]);
export type Comparator = z.infer<typeof ComparatorSchema>;

export const MetricConditionSchema = z.object({
  kind: z.literal("metric"),
  metric: z.enum(METRIC_IDS),
  /** team metrics: home | away | both | either; match metrics: match */
  subject: z.enum(["home", "away", "both", "either", "match"]),
  comparator: ComparatorSchema,
  value: z.number().min(0).max(100),
  /** Goal line for over/under metrics, e.g. 2.5 */
  line: z.number().min(0.5).max(9.5).nullable().optional(),
  /** The words in the user's instruction this condition came from. */
  sourcePhrase: z.string().max(200).optional(),
  /** True when the threshold was inferred from vague wording ("high", "poor"). */
  thresholdInferred: z.boolean().optional(),
  /**
   * Team metrics only. "venue" (default): home team's home games, away team's away games.
   * "overall": all recent matches in every competition.
   */
  window: z.enum(["venue", "overall"]).optional(),
  /** Team metrics only: use only the most recent N matches of the window (e.g. "last 6"). */
  lastN: z.number().int().min(3).max(20).optional(),
});

export const TeamConditionSchema = z.object({
  kind: z.literal("team"),
  teams: z.array(z.string().min(1).max(80)).min(1).max(20),
  subject: z.enum(["home", "away", "either"]),
  sourcePhrase: z.string().max(200).optional(),
});

export const CompetitionConditionSchema = z.object({
  kind: z.literal("competition"),
  competitions: z.array(z.string().min(1).max(80)).min(1).max(20),
  sourcePhrase: z.string().max(200).optional(),
});

export type MetricCondition = z.infer<typeof MetricConditionSchema>;
export type TeamCondition = z.infer<typeof TeamConditionSchema>;
export type CompetitionCondition = z.infer<typeof CompetitionConditionSchema>;
export type LeafCondition = MetricCondition | TeamCondition | CompetitionCondition;
export type Condition = LeafCondition | { kind: "group"; operator: "AND" | "OR"; conditions: Condition[] } | { kind: "not"; condition: Condition };

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    MetricConditionSchema,
    TeamConditionSchema,
    CompetitionConditionSchema,
    z.object({ kind: z.literal("group"), operator: z.enum(["AND", "OR"]), conditions: z.array(ConditionSchema).min(1).max(12) }),
    z.object({ kind: z.literal("not"), condition: ConditionSchema }),
  ]),
);

export const FilterPlanSchema = z.object({
  status: z.enum(["ok", "needs_clarification"]),
  clarificationQuestion: z.string().max(500).nullable(),
  /**
   * remove_matching: remove fixtures matching `removeWhen`; `keepWhen` (optional) are exceptions that are kept.
   * keep_only_matching: keep only fixtures matching `keepWhen`; `removeWhen` (optional) removes some of those.
   */
  mode: z.enum(["remove_matching", "keep_only_matching"]),
  removeWhen: ConditionSchema.nullable(),
  keepWhen: ConditionSchema.nullable(),
  summary: z.string().max(600),
  assumptions: z.array(z.string().max(300)).max(10),
  unsupported: z.array(z.string().max(300)).max(10),
  /**
   * Smallest number of matches a historical figure may be based on. Below it the
   * condition is "unknown" and the fixture goes to REVIEW. Default 5.
   */
  minSample: z.number().int().min(3).max(30).optional(),
});
export type FilterPlan = z.infer<typeof FilterPlanSchema>;

/* ------------------------------------------------------------------ */
/* Football data                                                       */
/* ------------------------------------------------------------------ */

export const RecentMatchSchema = z.object({
  fixtureId: z.number(),
  date: z.string(),
  competition: z.string(),
  venue: z.enum(["home", "away"]),
  opponent: z.string(),
  goalsFor: z.number().int(),
  goalsAgainst: z.number().int(),
  /** Competition identity (optional for records saved before league analysis existed). */
  leagueId: z.number().int().optional(),
  country: z.string().nullable().optional(),
  season: z.number().int().optional(),
});
export type RecentMatch = z.infer<typeof RecentMatchSchema>;

export const TeamCandidateSchema = z.object({
  id: z.number(),
  name: z.string(),
  country: z.string().nullable(),
  logo: z.string().nullable(),
  score: z.number(),
});
export type TeamCandidate = z.infer<typeof TeamCandidateSchema>;

export const TeamResolutionSchema = z.object({
  query: z.string(),
  status: z.enum(["matched", "ambiguous", "not_found", "error"]),
  method: z.enum(["exact", "alias", "normalized", "fuzzy", "manual"]).nullable(),
  team: TeamCandidateSchema.nullable(),
  candidates: z.array(TeamCandidateSchema).max(5),
  message: z.string().nullable(),
});
export type TeamResolution = z.infer<typeof TeamResolutionSchema>;

export const TeamDataSchema = z.object({
  resolution: TeamResolutionSchema,
  recent: z.array(RecentMatchSchema),
  dataAsOf: z.string().nullable(),
  stale: z.boolean(),
  error: z.string().nullable(),
});
export type TeamData = z.infer<typeof TeamDataSchema>;

export const LeagueStatsSchema = z.object({
  matches: z.number().int(),
  avgGoals: z.number(),
  homeGoalsAvg: z.number(),
  awayGoalsAvg: z.number(),
  bttsRate: z.number(),
  over05Rate: z.number(),
  over15Rate: z.number(),
  over25Rate: z.number(),
  over35Rate: z.number(),
  dataAsOf: z.string().nullable(),
});
export type LeagueStats = z.infer<typeof LeagueStatsSchema>;

export const FixtureStatsSchema = z.object({
  fixtureId: z.string(),
  home: TeamDataSchema,
  away: TeamDataSchema,
  prediction: z
    .object({
      apiFixtureId: z.number(),
      percentHome: z.number().nullable(),
      percentDraw: z.number().nullable(),
      percentAway: z.number().nullable(),
      advice: z.string().nullable(),
    })
    .nullable(),
  /** The league this fixture belongs to, as identified from both clubs' real match history. */
  league: z
    .object({
      id: z.number().int(),
      name: z.string(),
      country: z.string().nullable(),
      season: z.number().int(),
      identifiedBy: z.enum(["shared_matches", "screenshot_name"]),
    })
    .nullable()
    .optional(),
  /** League-wide figures computed from that league's finished matches this season. */
  leagueStats: LeagueStatsSchema.nullable().optional(),
  /** Previous meetings between the two clubs (most recent first). */
  h2h: z
    .object({
      meetings: z.array(
        z.object({ date: z.string(), competition: z.string(), homeTeam: z.string(), awayTeam: z.string(), homeGoals: z.number().int(), awayGoals: z.number().int() }),
      ),
      dataAsOf: z.string().nullable(),
    })
    .nullable()
    .optional(),
  /** Plain-language notes about data that could not be loaded. */
  notes: z.array(z.string()).optional(),
  fetchedAt: z.string(),
  source: z.string(),
});
export type FixtureStats = z.infer<typeof FixtureStatsSchema>;

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

export const DecisionValueSchema = z.enum(["KEEP", "REMOVE", "NEEDS_REVIEW"]);
export type DecisionValue = z.infer<typeof DecisionValueSchema>;

export const EvidenceSchema = z.object({
  metric: z.string(),
  label: z.string(),
  subject: z.string(),
  value: z.number().nullable(),
  display: z.string(),
  comparator: z.string().nullable(),
  threshold: z.number().nullable(),
  passed: z.boolean().nullable(),
  source: z.enum(["historical_match_data", "model_estimate", "screenshot_text"]),
  sampleSize: z.number().nullable(),
  /** Which matches the figure is based on, e.g. "home games, last 6". */
  basis: z.string().nullable().optional(),
  /** Date of the most recent match in the sample. */
  asOf: z.string().nullable().optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const CheckSchema = z.object({
  rule: z.enum(["remove", "keep"]),
  label: z.string(),
  result: z.enum(["met", "not_met", "unknown"]),
});
export type Check = z.infer<typeof CheckSchema>;

export const DecisionSchema = z.object({
  fixtureId: z.string(),
  decision: DecisionValueSchema,
  engineDecision: DecisionValueSchema,
  overridden: z.boolean(),
  reason: z.string(),
  evidence: z.array(EvidenceSchema),
  /** How complete the data behind the decision is. NOT the probability of any outcome. */
  confidence: z.number().min(0).max(1),
  missingData: z.array(z.string()),
  /** One entry per top-level criterion: did this fixture meet it? */
  checks: z.array(CheckSchema).optional(),
});
export type Decision = z.infer<typeof DecisionSchema>;

/* ------------------------------------------------------------------ */
/* Job record                                                          */
/* ------------------------------------------------------------------ */

export const JOB_STATUSES = [
  "PENDING",
  "UPLOADING",
  "EXTRACTING",
  "AWAITING_CONFIRMATION",
  "FETCHING_STATISTICS",
  "ANALYSING",
  "PROCESSING_IMAGE",
  "COMPLETED",
  "FAILED",
] as const;
export const JobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const StepSchema = z.object({
  id: z.enum(["upload", "extract", "interpret", "teams", "stats", "evaluate", "image"]),
  label: z.string(),
  state: z.enum(["pending", "active", "done", "failed", "skipped", "waiting"]),
  detail: z.string().nullable(),
});
export type Step = z.infer<typeof StepSchema>;

export const OutputSchema = z.object({
  key: z.string(),
  width: z.number(),
  height: z.number(),
  removedFixtureIds: z.array(z.string()),
  maskedFixtureIds: z.array(z.string()),
  warnings: z.array(z.string()),
  generatedAt: z.string(),
});

export const JobSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string(),
  status: JobStatusSchema,
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  image: z.object({
    key: z.string(),
    contentType: z.string(),
    width: z.number(),
    height: z.number(),
    sizeBytes: z.number(),
    originalName: z.string(),
  }),
  instruction: z.string(),
  steps: z.array(StepSchema),
  extraction: ExtractionSchema.nullable(),
  plan: FilterPlanSchema.nullable(),
  planError: z.string().nullable(),
  fixturesConfirmed: z.boolean(),
  stats: z.record(z.string(), FixtureStatsSchema),
  decisions: z.array(DecisionSchema).nullable(),
  summary: z.object({ text: z.string(), model: z.string() }).nullable(),
  output: OutputSchema.nullable(),
  /** Background-work lease, so a crashed worker can be resumed by the next poll. */
  lease: z.object({ until: z.string() }).nullable(),
  /** Scheduled automatic retry after a temporary AI overload (optional for older records). */
  retry: z.object({ count: z.number().int(), at: z.string() }).nullable().optional(),
  /** Plain-language notes about the run as a whole (e.g. statistics limit reached). */
  notices: z.array(z.string()).optional(),
  /** Fixtures whose statistics could not be loaded; they are evaluated as REVIEW, not retried forever. */
  statsUnavailable: z.array(z.string()).optional(),
});
export type Job = z.infer<typeof JobSchema>;
