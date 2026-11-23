import { describe, expect, it } from "vitest";
import { parseInstruction } from "@/lib/ai/instruction-parser";
import type { FilterPlan, Fixture, FixtureStats, LeagueStats, RecentMatch } from "@/lib/domain/schemas";
import { buildContext, evaluateFixture, fixtureNeedsStatistics, matchMetricValue, planDataNeeds, teamMetricValue } from "@/lib/filtering/engine";
import { validatePlan } from "@/lib/filtering/plan-validation";
import { h2hFigures, identifyLeague, summarizeLeague, toH2H } from "@/lib/football/context";

/*
 * MOCK DATA FOR ISOLATED TESTS ONLY — fictional clubs, leagues and results.
 * Shaped like the playbook in the reference: several leagues on one slip,
 * removing fixtures that are high-risk for "both teams to score".
 */

const LEAGUES = {
  serieB: { id: 136, name: "Serie B", country: "Italy" },
  prem: { id: 39, name: "Premier League", country: "England" },
  cup: { id: 45, name: "FA Cup", country: "England" },
};

let seq = 0;
/** Build a team's history: [goalsFor, goalsAgainst, venue] newest first. */
function history(rows: [number, number, "home" | "away"][], league = LEAGUES.prem, season = 2026): RecentMatch[] {
  return rows.map(([gf, ga, venue], i) => ({
    fixtureId: ++seq,
    date: new Date(Date.UTC(2026, 10, 20 - i * 7)).toISOString(),
    competition: league.name,
    venue,
    opponent: `Opponent ${i}`,
    goalsFor: gf,
    goalsAgainst: ga,
    leagueId: league.id,
    country: league.country,
    season,
  }));
}
const alt = (pairs: [number, number][]): [number, number, "home" | "away"][] => pairs.map(([f, a], i) => [f, a, i % 2 ? "away" : "home"]);

// Profiles (12 matches each, alternating home/away)
const prolific = alt([[3, 2], [2, 1], [3, 1], [2, 2], [4, 1], [2, 1], [3, 2], [2, 2], [3, 1], [2, 1], [3, 2], [2, 1]]);
const blunt = alt([[0, 1], [0, 0], [1, 0], [0, 2], [0, 0], [1, 1], [0, 1], [0, 0], [1, 0], [0, 1], [0, 0], [0, 1]]);
const fortress = alt([[1, 0], [2, 0], [1, 0], [0, 0], [2, 0], [1, 1], [1, 0], [0, 0], [2, 0], [1, 0], [1, 0], [0, 0]]);
const average = alt([[1, 1], [2, 1], [1, 2], [1, 1], [2, 0], [0, 1], [1, 1], [2, 2], [1, 0], [1, 1], [0, 2], [2, 1]]);

function fixture(id: number, home: string, away: string, competition: string | null): Fixture {
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

function team(name: string, recent: RecentMatch[], status: "matched" | "ambiguous" | "not_found" = "matched") {
  return {
    resolution: { query: name, status, method: status === "matched" ? ("exact" as const) : null, team: status === "matched" ? { id: seq + 1000, name, country: null, logo: null, score: 1 } : null, candidates: [], message: status === "matched" ? null : `Several clubs match "${name}".` },
    recent: status === "matched" ? recent : [],
    dataAsOf: recent[0]?.date ?? null,
    stale: false,
    error: null,
  };
}

const leagueStats = (over: Partial<LeagueStats> = {}): LeagueStats => ({
  matches: 180, avgGoals: 2.6, homeGoalsAvg: 1.45, awayGoalsAvg: 1.15, bttsRate: 0.5,
  over05Rate: 0.93, over15Rate: 0.75, over25Rate: 0.5, over35Rate: 0.27, dataAsOf: "2026-11-18T00:00:00Z", ...over,
});

function stats(
  f: Fixture,
  home: RecentMatch[],
  away: RecentMatch[],
  extra: Partial<FixtureStats> & { homeStatus?: "matched" | "ambiguous" | "not_found" } = {},
): FixtureStats {
  const { homeStatus, ...rest } = extra;
  return {
    fixtureId: f.id,
    home: team(f.homeTeam, home, homeStatus),
    away: team(f.awayTeam, away),
    prediction: null,
    fetchedAt: "2026-11-20T00:00:00Z",
    source: "MOCK",
    ...rest,
  };
}

const basePlan: Omit<FilterPlan, "removeWhen" | "keepWhen"> = {
  status: "ok", clarificationQuestion: null, mode: "remove_matching", summary: "test", assumptions: [], unsupported: [],
};
const metric = (metric: string, subject: string, comparator: string, value: number, extra: Record<string, unknown> = {}) =>
  ({ kind: "metric", metric, subject, comparator, value, line: null, ...extra }) as never;

/* ------------------------------------------------------------------ */

describe("multiple leagues in one screenshot, different criteria per league", () => {
  const fSerieB = fixture(1, "Modena", "Mantova", null); // league not visible on the screenshot
  const fPrem = fixture(2, "Northbridge", "Eastvale", "Premier League");
  const sSerieB = stats(fSerieB, history(average, LEAGUES.serieB), history(average, LEAGUES.serieB), {
    league: { ...LEAGUES.serieB, season: 2026, identifiedBy: "shared_matches" },
  });
  const sPrem = stats(fPrem, history(average), history(average));

  // Same club profiles in both leagues → read the actual estimate and set thresholds either side of it.
  const p = matchMetricValue(buildContext(fSerieB, sSerieB), "btts_probability").value!;
  const plan: FilterPlan = {
    ...basePlan,
    removeWhen: {
      kind: "group",
      operator: "OR",
      conditions: [
        { kind: "group", operator: "AND", conditions: [{ kind: "competition", competitions: ["Serie B"] }, metric("btts_probability", "match", ">=", p - 0.03)] },
        { kind: "group", operator: "AND", conditions: [{ kind: "not", condition: { kind: "competition", competitions: ["Serie B"] } }, metric("btts_probability", "match", ">=", p + 0.03)] },
      ],
    },
    keepWhen: null,
  };

  it("applies the stricter Serie B threshold using the league identified from match history", () => {
    expect(evaluateFixture(fSerieB, plan, sSerieB).decision).toBe("REMOVE");
  });
  it("applies the other threshold everywhere else", () => {
    expect(evaluateFixture(fPrem, plan, sPrem).decision).toBe("KEEP");
  });
  it("reviews a fixture whose competition is neither visible nor identifiable", () => {
    const f = fixture(3, "A", "B", null);
    expect(evaluateFixture(f, plan, stats(f, history(average), history(average))).decision).toBe("NEEDS_REVIEW");
  });
});

describe("playbook criteria", () => {
  it("keeps when the away team has a poor scoring record away from home (exception rule)", () => {
    const f = fixture(1, "Kolding", "Koge", "1st Division");
    const plan: FilterPlan = {
      ...basePlan,
      removeWhen: metric("btts_probability", "match", ">=", 0.3, { sourcePhrase: "both teams likely to score" }),
      keepWhen: metric("failed_to_score_rate", "away", ">=", 0.4, { sourcePhrase: "away side often fails to score" }),
    };
    const d = evaluateFixture(f, plan, stats(f, history(prolific), history(blunt)));
    expect(d.decision).toBe("KEEP");
    expect(d.reason).toMatch(/^Kept: meets your exception “away side often fails to score”/);
    expect(d.checks).toEqual([
      { rule: "remove", label: "both teams likely to score", result: "met" },
      { rule: "keep", label: "away side often fails to score", result: "met" },
    ]);
  });

  it("removes when both teams have consistently strong scoring records", () => {
    const f = fixture(1, "Harbour City", "Kingsford", "Premier League");
    const plan: FilterPlan = { ...basePlan, removeWhen: metric("goals_scored_avg", "both", ">=", 1.8, { sourcePhrase: "both teams score freely" }), keepWhen: null };
    const d = evaluateFixture(f, plan, stats(f, history(prolific), history(prolific)));
    expect(d.decision).toBe("REMOVE");
    expect(d.reason).toMatch(/^Removed: meets your removal criteria “both teams score freely”/);
    expect(d.evidence.every((e) => e.source === "historical_match_data" && e.basis && e.asOf)).toBe(true);
  });

  it("removes a high-risk fixture where one side keeps clean sheets and the other rarely scores (either direction)", () => {
    const f = fixture(1, "Jablonec", "Slavia", "Chance Liga");
    const pairing = (a: "home" | "away", b: "home" | "away") => ({
      kind: "group",
      operator: "AND",
      conditions: [metric("clean_sheet_rate", a, ">=", 0.4, { window: "overall" }), metric("failed_to_score_rate", b, ">=", 0.4, { window: "overall" })],
    });
    const plan: FilterPlan = { ...basePlan, removeWhen: { kind: "group", operator: "OR", conditions: [pairing("home", "away"), pairing("away", "home")] } as never, keepWhen: null };
    expect(evaluateFixture(f, plan, stats(f, history(blunt), history(fortress))).decision).toBe("REMOVE");
    expect(evaluateFixture(f, plan, stats(f, history(prolific), history(prolific))).decision).toBe("KEEP");
  });

  it("handles conflicting conditions predictably", () => {
    const f = fixture(1, "A", "B", "Premier League");
    const s = stats(f, history(prolific), history(prolific));
    const removeAll = metric("goals_scored_avg", "both", ">=", 1.0);
    const keepAll = metric("goals_scored_avg", "either", ">=", 1.0);
    // remove mode: an explicit exception wins
    expect(evaluateFixture(f, { ...basePlan, removeWhen: removeAll, keepWhen: keepAll }, s).decision).toBe("KEEP");
    // keep-only mode: an explicit exclusion wins
    expect(evaluateFixture(f, { ...basePlan, mode: "keep_only_matching", removeWhen: removeAll, keepWhen: keepAll }, s).decision).toBe("REMOVE");
  });
});

describe("REVIEW rather than automatic filtering", () => {
  const plan: FilterPlan = { ...basePlan, removeWhen: metric("goals_scored_avg", "both", ">=", 1.8, { sourcePhrase: "both score freely" }), keepWhen: null };

  it("missing statistics → REVIEW with an explanation", () => {
    const f = fixture(1, "A", "B", null);
    const d = evaluateFixture(f, plan, null);
    expect(d.decision).toBe("NEEDS_REVIEW");
    expect(d.reason).toMatch(/^Review: “both score freely” could not be checked/);
    expect(d.checks?.[0]?.result).toBe("unknown");
  });

  it("insufficient sample under the playbook's minimum → REVIEW", () => {
    const f = fixture(1, "A", "B", null);
    const s = stats(f, history(prolific.slice(0, 6)), history(prolific.slice(0, 6)));
    expect(evaluateFixture(f, { ...plan, minSample: 5 }, s).decision).toBe("REMOVE");
    const strict = evaluateFixture(f, { ...plan, minSample: 8 }, s);
    expect(strict.decision).toBe("NEEDS_REVIEW");
    expect(strict.missingData.join(" ")).toMatch(/need 8/);
  });

  it("incorrect or ambiguous team identification → REVIEW", () => {
    const f = fixture(1, "Rangers", "Celtic", null);
    const d = evaluateFixture(f, plan, stats(f, history(prolific), history(prolific), { homeStatus: "ambiguous" }));
    expect(d.decision).toBe("NEEDS_REVIEW");
    expect(d.missingData.join(" ")).toMatch(/could not be reliably identified/);
  });
});

describe("head-to-head criteria", () => {
  const meeting = (date: string, hg: number, ag: number) => ({ fixture: { date, status: { short: "FT" } }, goals: { home: hg, away: ag }, teams: { home: { id: 1, name: "Slovacko" }, away: { id: 2, name: "Teplice" } }, league: { name: "Chance Liga" } });
  const lowScoring = toH2H([meeting("2026-05-01", 1, 0), meeting("2025-11-01", 0, 0), meeting("2025-04-01", 1, 1), meeting("2024-10-01", 0, 1)]);
  const plan: FilterPlan = { ...basePlan, removeWhen: metric("h2h_avg_goals", "match", "<=", 2.0, { sourcePhrase: "meetings are usually low-scoring" }), keepWhen: null };

  it("removes when previous meetings are low-scoring, with the meetings as evidence", () => {
    const f = fixture(1, "Slovacko", "Teplice", "Chance Liga");
    const d = evaluateFixture(f, plan, stats(f, history(average), history(average), { h2h: lowScoring }));
    expect(d.decision).toBe("REMOVE");
    expect(d.evidence[0]).toMatchObject({ value: 1, sampleSize: 4, basis: "last 4 meetings", asOf: "2026-05-01" });
  });

  it("reviews when there are too few meetings to judge", () => {
    const f = fixture(1, "Slovacko", "Teplice", null);
    const two = toH2H([meeting("2026-05-01", 1, 0), meeting("2025-11-01", 0, 0)]);
    expect(evaluateFixture(f, plan, stats(f, history(average), history(average), { h2h: two })).decision).toBe("NEEDS_REVIEW");
    expect(evaluateFixture(f, plan, stats(f, history(average), history(average), { h2h: null })).decision).toBe("NEEDS_REVIEW");
  });
});

describe("league-aware analysis", () => {
  const league = { ...LEAGUES.serieB, season: 2026, identifiedBy: "shared_matches" as const };
  const plan: FilterPlan = { ...basePlan, removeWhen: metric("league_avg_goals", "match", "<=", 2.4, { sourcePhrase: "defensive league" }), keepWhen: null };

  it("removes fixtures in a low-scoring league, using real league figures", () => {
    const f = fixture(1, "Modena", "Mantova", null);
    const d = evaluateFixture(f, plan, stats(f, history(average), history(average), { league, leagueStats: leagueStats({ avgGoals: 2.2 }) }));
    expect(d.decision).toBe("REMOVE");
    expect(d.evidence[0]?.basis).toBe("Serie B 2026/27");
  });

  it("does not judge a league from too few matches, or when the league is unknown", () => {
    const f = fixture(1, "Modena", "Mantova", null);
    expect(evaluateFixture(f, plan, stats(f, history(average), history(average), { league, leagueStats: leagueStats({ matches: 12, avgGoals: 2.0 }) })).decision).toBe("NEEDS_REVIEW");
    expect(evaluateFixture(f, plan, stats(f, history(average), history(average))).decision).toBe("NEEDS_REVIEW");
  });

  it("anchors the goal model to the league's own averages", () => {
    const f = fixture(1, "A", "B", null);
    const generic = matchMetricValue(buildContext(f, stats(f, history(average), history(average))), "expected_total_goals").value!;
    const lowLeague = matchMetricValue(
      buildContext(f, stats(f, history(average), history(average), { league, leagueStats: leagueStats({ homeGoalsAvg: 1.0, awayGoalsAvg: 0.75 }) })),
      "expected_total_goals",
    ).value!;
    expect(lowLeague).toBeLessThan(generic);
  });
});

describe("match windows and combined records", () => {
  const f = fixture(1, "A", "B", null);
  // Strong at home, poor away.
  const split = history([[3, 0, "home"], [0, 2, "away"], [2, 0, "home"], [0, 1, "away"], [4, 1, "home"], [0, 3, "away"], [2, 1, "home"], [1, 2, "away"], [3, 0, "home"], [0, 2, "away"], [2, 0, "home"], [0, 1, "away"]]);
  const ctx = buildContext(f, stats(f, split, split));

  it("uses home games for the home side by default, and all matches when asked", () => {
    const venue = teamMetricValue(ctx, "goals_scored_avg", "home");
    const overall = teamMetricValue(ctx, "goals_scored_avg", "home", { window: "overall" });
    expect(venue.value).toBeCloseTo(16 / 6);
    expect(venue.basis).toBe("home games");
    expect(overall.value).toBeCloseTo(17 / 12);
    expect(overall.basis).toBe("all matches");
  });

  it("limits to the last N matches", () => {
    const last3 = teamMetricValue(ctx, "goals_scored_avg", "away", { lastN: 3 });
    expect(last3.sample).toBe(3);
    expect(last3.basis).toBe("away games, last 3");
    expect(last3.value).toBeCloseTo(0);
  });

  it("falls back to all matches (and says so) when the home sample is too small", () => {
    const few = history([[1, 0, "home"], [2, 1, "away"], [1, 1, "away"], [0, 0, "away"], [3, 1, "away"], [1, 2, "away"]]);
    const r = teamMetricValue(buildContext(f, stats(f, few, few)), "goals_scored_avg", "home");
    expect(r.basis).toMatch(/all matches \(only 1 home game available\)/);
  });

  it("computes Over/Under at any line and combined BTTS from both clubs' records", () => {
    expect(teamMetricValue(ctx, "over_goals_rate", "home", { line: 1.5 }).value).toBeCloseTo(6 / 6);
    expect(teamMetricValue(ctx, "under_goals_rate", "away", { line: 2.5 }).value).toBeCloseTo(4 / 6);
    const c = matchMetricValue(ctx, "combined_btts_rate");
    const h = teamMetricValue(ctx, "btts_rate", "home").value!;
    const a = teamMetricValue(ctx, "btts_rate", "away").value!;
    expect(c.value).toBeCloseTo((h + a) / 2);
  });
});

describe("data needs (no unnecessary statistics requests)", () => {
  it("derives which data a plan needs", () => {
    const comp: FilterPlan = { ...basePlan, removeWhen: { kind: "competition", competitions: ["Serie B"] }, keepWhen: null };
    expect(planDataNeeds(comp)).toEqual({ teams: false, h2h: false, league: false, competitionLookup: true });
    expect(fixtureNeedsStatistics(planDataNeeds(comp), { competition: "Serie B", excluded: false })).toBe(false);
    expect(fixtureNeedsStatistics(planDataNeeds(comp), { competition: null, excluded: false })).toBe(true);
    const h2h: FilterPlan = { ...basePlan, removeWhen: metric("h2h_btts_rate", "match", "<=", 0.4), keepWhen: null };
    expect(planDataNeeds(h2h)).toMatchObject({ teams: true, h2h: true, league: false });
    const model: FilterPlan = { ...basePlan, removeWhen: metric("btts_probability", "match", ">=", 0.6), keepWhen: null };
    expect(planDataNeeds(model)).toMatchObject({ teams: true, league: true, h2h: false });
  });
});

describe("league identification and league / head-to-head figures", () => {
  it("chooses the league both clubs play in, not a one-off cup tie", () => {
    const h = [...history(average.slice(0, 8), LEAGUES.prem), ...history(average.slice(0, 1), LEAGUES.cup)];
    const a = [...history(average.slice(0, 8), LEAGUES.prem), ...history(average.slice(0, 1), LEAGUES.cup)];
    expect(identifyLeague(h, a, null)).toMatchObject({ id: 39, name: "Premier League", season: 2026, identifiedBy: "shared_matches" });
  });
  it("falls back to the competition name on the screenshot, or returns null", () => {
    const h = history(average.slice(0, 5), LEAGUES.serieB);
    const a = history(average.slice(0, 5), LEAGUES.prem);
    expect(identifyLeague(h, a, "Serie B")).toMatchObject({ id: 136, identifiedBy: "screenshot_name" });
    expect(identifyLeague(h, a, null)).toBeNull();
    expect(identifyLeague([], [], "Serie B")).toBeNull();
  });
  it("summarises a league season from finished matches only", () => {
    const fx = (h: number | null, a: number | null, status = "FT") => ({ fixture: { date: "2026-10-01", status: { short: status } }, goals: { home: h, away: a } });
    const s = summarizeLeague([fx(1, 0), fx(2, 2), fx(0, 0), fx(3, 1), fx(null, null, "NS")])!;
    expect(s.matches).toBe(4);
    expect(s.avgGoals).toBeCloseTo(9 / 4);
    expect(s.bttsRate).toBeCloseTo(2 / 4);
    expect(s.over25Rate).toBeCloseTo(2 / 4);
    expect(s.over05Rate).toBeCloseTo(3 / 4);
    expect(summarizeLeague([])).toBeNull();
  });
  it("keeps the 10 most recent meetings, newest first", () => {
    const list = Array.from({ length: 14 }, (_, i) => ({ fixture: { date: `20${10 + i}-01-01`, status: { short: "FT" } }, goals: { home: 1, away: i % 2 }, teams: { home: { id: 1, name: "A" }, away: { id: 2, name: "B" } } }));
    const h = toH2H(list);
    expect(h.meetings).toHaveLength(10);
    expect(h.meetings[0]!.date).toBe("2023-01-01");
    expect(h2hFigures(h)!.bttsRate).toBeCloseTo(0.5);
  });
});

describe("instructions", () => {
  it("asks for clarification on an ambiguous instruction instead of guessing (stubbed model)", async () => {
    const r = await parseInstruction("Sort out the risky ones.", async () =>
      JSON.stringify({ status: "needs_clarification", clarificationQuestion: "Risky for which bet — both teams to score, over goals, or a win?", mode: "remove_matching", removeWhen: null, keepWhen: null, summary: "", assumptions: [], unsupported: [] }),
    );
    expect(r.plan?.status).toBe("needs_clarification");
    expect(r.plan?.clarificationQuestion).toMatch(/which bet/);
  });

  it("validates playbook options: windows only on team history, league lines up to 3.5, minimum sample", () => {
    const v = validatePlan({
      ...basePlan,
      minSample: 8,
      removeWhen: { kind: "group", operator: "OR", conditions: [metric("btts_probability", "match", ">=", 0.6, { window: "overall", lastN: 6 }), metric("failed_to_score_rate", "away", ">=", 0.4, { lastN: 6 })] },
      keepWhen: null,
    });
    expect(v.ok).toBe(true);
    const [model, team] = (v.plan!.removeWhen as { conditions: Record<string, unknown>[] }).conditions;
    expect(model!.window).toBeUndefined();
    expect(model!.lastN).toBeUndefined();
    expect(team!.lastN).toBe(6);
    expect(v.plan!.minSample).toBe(8);
    expect(validatePlan({ ...basePlan, removeWhen: metric("league_over_goals_rate", "match", ">=", 0.5, { line: 4.5 }), keepWhen: null }).ok).toBe(false);
  });
});

describe("explanations and plan restrictions", () => {
  it("phrases criteria that were not met without a false comparison", () => {
    const f = fixture(1, "A", "B", null);
    const plan: FilterPlan = { ...basePlan, removeWhen: metric("goals_scored_avg", "both", ">=", 5, { sourcePhrase: "both score five a game" }), keepWhen: null };
    const d = evaluateFixture(f, plan, stats(f, history(prolific), history(prolific)));
    expect(d.decision).toBe("KEEP");
    expect(d.reason).toMatch(/Goals scored per game \(A\) \d\.\d\d, not ≥ 5\.00/);
  });
});
