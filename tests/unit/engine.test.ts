import { describe, expect, it } from "vitest";
import type { FilterPlan, Fixture, FixtureStats, RecentMatch } from "@/lib/domain/schemas";
import { decide, evaluateFixture, planNeedsStatistics } from "@/lib/filtering/engine";

// MOCK DATA: synthetic fixtures and match histories for isolated engine tests.

function fixture(id: number, home: string, away: string, competition: string | null = "Premier League"): Fixture {
  return {
    id: `match_${String(id).padStart(3, "0")}`,
    homeTeam: home,
    awayTeam: away,
    competition,
    date: null,
    kickoff: null,
    odds: [],
    confidence: 0.95,
    box: { x: 0, y: id * 100, width: 400, height: 80 },
    issues: [],
    userEdited: false,
    excluded: false,
  };
}

function history(gf: number[], ga: number[], venue: "home" | "away" | "mixed" = "mixed"): RecentMatch[] {
  return gf.map((g, i) => ({
    fixtureId: i,
    date: `2026-11-${String(15 - i).padStart(2, "0")}T15:00:00Z`,
    competition: "Test",
    venue: venue === "mixed" ? (i % 2 ? "away" : "home") : venue,
    opponent: "X",
    goalsFor: g,
    goalsAgainst: ga[i]!,
  }));
}

function stats(fid: string, homeRecent: RecentMatch[], awayRecent: RecentMatch[], opts: { awayStatus?: "matched" | "ambiguous" } = {}): FixtureStats {
  const team = (id: number, name: string, recent: RecentMatch[], status: "matched" | "ambiguous" = "matched") => ({
    resolution: { query: name, status, method: status === "matched" ? ("exact" as const) : null, team: status === "matched" ? { id, name, country: "England", logo: null, score: 1 } : null, candidates: [], message: null },
    recent,
    dataAsOf: recent[0]?.date ?? null,
    stale: false,
    error: null,
  });
  return { fixtureId: fid, home: team(1, "Home", homeRecent), away: team(2, "Away", awayRecent, opts.awayStatus), prediction: null, fetchedAt: "2026-11-20T00:00:00Z", source: "MOCK" };
}

const highScoring = history([3, 2, 3, 2, 4, 2, 3, 2], [2, 1, 2, 2, 1, 2, 1, 2]);
const lowScoring = history([0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 0, 0, 1, 0, 0, 1]);

const bttsPlan: FilterPlan = {
  status: "ok",
  clarificationQuestion: null,
  mode: "remove_matching",
  removeWhen: { kind: "metric", metric: "btts_probability", subject: "match", comparator: ">=", value: 0.6 },
  keepWhen: null,
  summary: "Remove likely BTTS",
  assumptions: [],
  unsupported: [],
};

describe("decision table", () => {
  it("remove_matching", () => {
    expect(decide("remove_matching", true, undefined)).toBe("REMOVE");
    expect(decide("remove_matching", false, undefined)).toBe("KEEP");
    expect(decide("remove_matching", null, undefined)).toBe("NEEDS_REVIEW");
    expect(decide("remove_matching", true, true)).toBe("KEEP"); // explicit retention wins
    expect(decide("remove_matching", true, null)).toBe("NEEDS_REVIEW");
    expect(decide("remove_matching", true, false)).toBe("REMOVE");
  });
  it("keep_only_matching", () => {
    expect(decide("keep_only_matching", undefined, true)).toBe("KEEP");
    expect(decide("keep_only_matching", undefined, false)).toBe("REMOVE");
    expect(decide("keep_only_matching", undefined, null)).toBe("NEEDS_REVIEW");
    expect(decide("keep_only_matching", true, true)).toBe("REMOVE");
    expect(decide("keep_only_matching", null, true)).toBe("NEEDS_REVIEW");
  });
});

describe("evaluateFixture", () => {
  it("removes a high-BTTS fixture and keeps a low one, with evidence", () => {
    const f1 = fixture(1, "Goals FC", "Leaky Town");
    const f2 = fixture(2, "Dull United", "Nil Rovers");
    const d1 = evaluateFixture(f1, bttsPlan, stats(f1.id, highScoring, highScoring));
    const d2 = evaluateFixture(f2, bttsPlan, stats(f2.id, lowScoring, lowScoring));
    expect(d1.decision).toBe("REMOVE");
    expect(d2.decision).toBe("KEEP");
    expect(d1.evidence[0]?.source).toBe("model_estimate");
    expect(d1.evidence[0]?.value).toBeGreaterThan(0.6);
    expect(d1.reason).toMatch(/removal criteria/);
  });

  it("returns NEEDS_REVIEW (never REMOVE) when data is missing", () => {
    const f = fixture(1, "Goals FC", "Mystery");
    const d = evaluateFixture(f, bttsPlan, stats(f.id, highScoring, highScoring, { awayStatus: "ambiguous" }));
    expect(d.decision).toBe("NEEDS_REVIEW");
    expect(d.missingData.length).toBeGreaterThan(0);
    const noStats = evaluateFixture(f, bttsPlan, null);
    expect(noStats.decision).toBe("NEEDS_REVIEW");
  });

  it("returns NEEDS_REVIEW when the sample is too small", () => {
    const f = fixture(1, "A", "B");
    const d = evaluateFixture(f, bttsPlan, stats(f.id, history([1, 2], [0, 1]), highScoring));
    expect(d.decision).toBe("NEEDS_REVIEW");
    expect(d.missingData.join(" ")).toMatch(/Only 2 recent/);
  });

  it("supports AND / OR across both teams", () => {
    const plan: FilterPlan = {
      ...bttsPlan,
      removeWhen: { kind: "metric", metric: "goals_scored_avg", subject: "both", comparator: ">=", value: 1.8 },
    };
    const f = fixture(1, "A", "B");
    expect(evaluateFixture(f, plan, stats(f.id, highScoring, highScoring)).decision).toBe("REMOVE");
    expect(evaluateFixture(f, plan, stats(f.id, highScoring, lowScoring)).decision).toBe("KEEP");
    const either = { ...plan, removeWhen: { ...plan.removeWhen!, subject: "either" as const } } as FilterPlan;
    expect(evaluateFixture(f, either, stats(f.id, highScoring, lowScoring)).decision).toBe("REMOVE");
  });

  it("OR group: removes if any clause holds; AND group requires all", () => {
    const f = fixture(1, "Arsenal", "Chelsea");
    const s = stats(f.id, lowScoring, lowScoring);
    const orPlan: FilterPlan = {
      ...bttsPlan,
      removeWhen: { kind: "group", operator: "OR", conditions: [bttsPlan.removeWhen!, { kind: "team", teams: ["Chelsea"], subject: "either" }] },
    };
    expect(evaluateFixture(f, orPlan, s).decision).toBe("REMOVE");
    const andPlan: FilterPlan = { ...orPlan, removeWhen: { kind: "group", operator: "AND", conditions: (orPlan.removeWhen as unknown as { conditions: never[] }).conditions } };
    expect(evaluateFixture(f, andPlan, s).decision).toBe("KEEP");
  });

  it("explicit keep exception overrides removal", () => {
    const plan: FilterPlan = {
      ...bttsPlan,
      keepWhen: { kind: "metric", metric: "failed_to_score_rate", subject: "away", comparator: ">=", value: 0.4 },
    };
    const f = fixture(1, "A", "B");
    // Away team: scores rarely in away games → kept even though home side is high-scoring
    const awayRarely = history([0, 0, 0, 1, 0, 0, 2, 0], [3, 3, 2, 3, 2, 4, 3, 2]);
    const d = evaluateFixture(f, plan, stats(f.id, highScoring, awayRarely));
    expect(d.decision).toBe("KEEP");
  });

  it("filters by team names and competitions without needing statistics", () => {
    const plan: FilterPlan = {
      ...bttsPlan,
      removeWhen: { kind: "team", teams: ["Man Utd"], subject: "either" },
    };
    expect(planNeedsStatistics(plan)).toBe(false);
    expect(evaluateFixture(fixture(1, "Manchester United", "Leeds"), plan, null).decision).toBe("REMOVE");
    expect(evaluateFixture(fixture(2, "Manchester City", "Leeds"), plan, null).decision).toBe("KEEP");

    const keepPL: FilterPlan = { ...bttsPlan, mode: "keep_only_matching", removeWhen: null, keepWhen: { kind: "competition", competitions: ["Premier League"] } };
    expect(evaluateFixture(fixture(3, "A", "B", "Premier League"), keepPL, null).decision).toBe("KEEP");
    expect(evaluateFixture(fixture(4, "A", "B", "La Liga"), keepPL, null).decision).toBe("REMOVE");
    expect(evaluateFixture(fixture(5, "A", "B", null), keepPL, null).decision).toBe("NEEDS_REVIEW");
  });

  it("never touches fixtures the user excluded", () => {
    const f = { ...fixture(1, "A", "B"), excluded: true };
    expect(evaluateFixture(f, bttsPlan, null).decision).toBe("KEEP");
  });

  it("supports over/under lines", () => {
    const plan: FilterPlan = {
      ...bttsPlan,
      mode: "keep_only_matching",
      removeWhen: null,
      keepWhen: { kind: "metric", metric: "under_goals_probability", subject: "match", comparator: ">=", value: 0.6, line: 2.5 },
    };
    const f = fixture(1, "A", "B");
    expect(evaluateFixture(f, plan, stats(f.id, lowScoring, lowScoring)).decision).toBe("KEEP");
    expect(evaluateFixture(f, plan, stats(f.id, highScoring, highScoring)).decision).toBe("REMOVE");
  });

  it("confidence reflects data completeness, bounded 0..1", () => {
    const f = fixture(1, "A", "B");
    const d = evaluateFixture(f, bttsPlan, stats(f.id, highScoring, highScoring));
    expect(d.confidence).toBeGreaterThan(0);
    expect(d.confidence).toBeLessThanOrEqual(1);
  });
});
