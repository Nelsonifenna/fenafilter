import { describe, expect, it } from "vitest";
import type { RecentMatch } from "@/lib/domain/schemas";
import { classifyApiErrors } from "@/lib/football/api-football";
import { estimateMatch, fromLambdas, poissonPmf, probOver, probUnder } from "@/lib/football/poisson";
import { resolveFromCandidates, resolvePair, toRecentMatches } from "@/lib/football/resolver";
import { computeSplit, computeTeamProfile, isStale } from "@/lib/football/stats";
import { canonicalName, namesRefersToSameTeam, searchTermFor, similarity } from "@/lib/football/team-names";

// MOCK DATA: synthetic match results for isolated unit tests only.
function m(date: string, venue: "home" | "away", gf: number, ga: number): RecentMatch {
  return { fixtureId: Math.floor(Math.random() * 1e6), date, competition: "Test League", venue, opponent: "Opponent", goalsFor: gf, goalsAgainst: ga };
}

describe("poisson model", () => {
  it("pmf sums to ~1", () => {
    let s = 0;
    for (let k = 0; k < 30; k++) s += poissonPmf(k, 1.7);
    expect(s).toBeCloseTo(1, 6);
  });

  it("computes BTTS as product of scoring probabilities and consistent outcome probabilities", () => {
    const e = fromLambdas(1.5, 1.1);
    expect(e.pHomeScores).toBeCloseTo(1 - Math.exp(-1.5), 6);
    expect(e.pBtts).toBeCloseTo((1 - Math.exp(-1.5)) * (1 - Math.exp(-1.1)), 6);
    expect(e.pHomeWin + e.pDraw + e.pAwayWin).toBeCloseTo(1, 4);
    expect(probOver(e, 2.5) + probUnder(e, 2.5)).toBeCloseTo(1, 9);
    expect(e.pHomeWinToNil).toBeLessThan(e.pHomeWin);
    expect(e.pHomeCleanSheet).toBeCloseTo(Math.exp(-1.1), 6);
  });

  it("over 2.5 equals 1 - P(0,1,2 goals) for total lambda", () => {
    const e = fromLambdas(1.2, 0.9);
    const L = 2.1;
    const under = Math.exp(-L) * (1 + L + (L * L) / 2);
    expect(probOver(e, 2.5)).toBeCloseTo(1 - under, 4);
  });

  it("shrinks small samples toward the prior and uses venue splits", () => {
    const strongHome = computeTeamProfile([
      m("2026-11-01", "home", 4, 0), m("2026-10-25", "home", 3, 0), m("2026-10-18", "home", 5, 1),
      m("2026-10-11", "away", 1, 1), m("2026-10-04", "away", 0, 2),
    ]);
    const weakAway = computeTeamProfile([
      m("2026-11-01", "away", 0, 3), m("2026-10-25", "away", 0, 2), m("2026-10-18", "away", 1, 4),
      m("2026-10-11", "home", 1, 1), m("2026-10-04", "home", 2, 2),
    ]);
    const e = estimateMatch(strongHome, weakAway)!;
    expect(e).not.toBeNull();
    // Raw home rate would be (4 + 3)/2 = 3.5; shrinkage must pull it down.
    expect(e.lambdaHome).toBeLessThan(3.5);
    expect(e.lambdaHome).toBeGreaterThan(1.45);
    expect(e.pHomeWin).toBeGreaterThan(e.pAwayWin);
  });
});

describe("descriptive statistics", () => {
  it("computes splits and rates from real results", () => {
    const s = computeSplit([m("2026-01-01", "home", 2, 1), m("2026-01-08", "home", 0, 0), m("2026-01-15", "away", 0, 2), m("2026-01-22", "away", 3, 0)]);
    expect(s.played).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.draws).toBe(1);
    expect(s.bttsRate).toBe(0.25);
    expect(s.cleanSheetRate).toBe(0.5);
    expect(s.failedToScoreRate).toBe(0.5);
    expect(s.over25Rate).toBe(0.5);
    expect(s.avgFor).toBe(1.25);
  });

  it("returns null rates for empty samples (no fabricated values)", () => {
    const s = computeSplit([]);
    expect(s.avgFor).toBeNull();
    expect(s.bttsRate).toBeNull();
  });

  it("computes form most recent first", () => {
    const p = computeTeamProfile([m("2026-01-01", "home", 0, 1), m("2026-02-01", "home", 2, 0), m("2026-03-01", "away", 1, 1)]);
    expect(p.form).toBe("DWL");
    expect(p.formPointsPerGame).toBeCloseTo(4 / 3);
  });

  it("flags stale data", () => {
    const now = new Date("2026-11-20T00:00:00Z");
    expect(isStale("2026-11-10T00:00:00Z", now)).toBe(false);
    expect(isStale("2026-08-01T00:00:00Z", now)).toBe(true);
    expect(isStale(null, now)).toBe(true);
  });
});

describe("team name matching", () => {
  it("never treats Manchester United and Manchester City as the same club", () => {
    expect(namesRefersToSameTeam("Manchester United", "Manchester City")).toBe(false);
    expect(namesRefersToSameTeam("Man Utd", "Manchester United")).toBe(true);
    expect(similarity("Man Utd", "Manchester City")).toBeLessThan(0.7);
  });

  it("normalises accents, prefixes and aliases", () => {
    expect(canonicalName("FC Bayern München")).toBe(canonicalName("Bayern Munich"));
    expect(canonicalName("Arsenal FC")).toBe("arsenal");
    expect(canonicalName("Spurs")).toBe(canonicalName("Tottenham Hotspur"));
    expect(namesRefersToSameTeam("Arsenal", "Arsenal FC")).toBe(true);
    expect(namesRefersToSameTeam("Arsenal", "Arsenal Women")).toBe(false);
  });

  it("builds an API search term of 3+ chars", () => {
    expect(searchTermFor("Man Utd")).toBe("manchester");
    expect(searchTermFor("FC")).toBeNull();
  });

  const cands = [
    { id: 33, name: "Manchester United", country: "England", national: false, logo: null },
    { id: 50, name: "Manchester City", country: "England", national: false, logo: null },
    { id: 1001, name: "Manchester United W", country: "England", national: false, logo: null },
  ];

  it("resolves an exact/alias match and avoids reserve teams", () => {
    const r = resolveFromCandidates("Man Utd", cands);
    expect(r.status).toBe("matched");
    expect(r.team?.id).toBe(33);
    expect(r.method).toBe("alias");
  });

  it("flags ambiguity when two clubs share a name in different countries", () => {
    const r = resolveFromCandidates("Rangers", [
      { id: 1, name: "Rangers", country: "Scotland", national: false, logo: null },
      { id: 2, name: "Rangers", country: "Chile", national: false, logo: null },
    ]);
    expect(r.status).toBe("ambiguous");
    expect(r.candidates.length).toBe(2);
  });

  it("uses the opponent's country to break ties", () => {
    const { home, away } = resolvePair(
      "Celtic",
      "Rangers",
      [{ id: 10, name: "Celtic", country: "Scotland", national: false, logo: null }],
      [
        { id: 1, name: "Rangers", country: "Scotland", national: false, logo: null },
        { id: 2, name: "Rangers", country: "Chile", national: false, logo: null },
      ],
      null,
    );
    expect(home.status).toBe("matched");
    expect(away.status).toBe("matched");
    expect(away.team?.id).toBe(1);
  });

  it("reports not_found for unknown teams", () => {
    expect(resolveFromCandidates("Xyzzy Rovers", cands).status).toBe("not_found");
    expect(resolveFromCandidates("", cands).status).toBe("not_found");
  });
});

describe("API-Football response handling", () => {
  it("classifies error payloads", () => {
    expect(classifyApiErrors([])).toBeNull();
    expect(classifyApiErrors({ token: "Error/Missing application key." })?.kind).toBe("auth");
    expect(classifyApiErrors({ plan: "Free plans do not have access to this season, try from 2022 to 2024." })?.kind).toBe("plan");
    expect(classifyApiErrors({ requests: "You have reached the request limit for the day" })?.kind).toBe("quota_daily");
    expect(classifyApiErrors({ rateLimit: "Too many requests. You have exceeded the limit of requests per minute." })?.kind).toBe("rate_minute");
  });

  it("converts fixtures to the team's perspective and drops unfinished games", () => {
    const fx = (id: number, home: number, away: number, gh: number | null, ga: number | null, status = "FT") => ({
      fixture: { id, date: `2026-10-${String(id).padStart(2, "0")}T15:00:00+00:00`, status: { short: status } },
      league: { name: "League" },
      teams: { home: { id: home, name: `T${home}` }, away: { id: away, name: `T${away}` } },
      goals: { home: gh, away: ga },
    });
    const res = toRecentMatches(7, [fx(1, 7, 8, 2, 1), fx(2, 9, 7, 3, 0), fx(3, 7, 9, null, null, "NS"), fx(4, 7, 5, 1, 1, "PST")]);
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ venue: "away", goalsFor: 0, goalsAgainst: 3, opponent: "T9" });
    expect(res[1]).toMatchObject({ venue: "home", goalsFor: 2, goalsAgainst: 1 });
  });
});

describe("real-world name mismatches seen in production", () => {
  // Candidate lists shaped like the provider's real responses (fictional ids).
  it("matches 'Derby County' to the first team stored as 'Derby', not reserve or women's sides", () => {
    const r = resolveFromCandidates("Derby County", [
      { id: 1, name: "Derby County Res.", country: "England", national: false, logo: null },
      { id: 2, name: "Derby", country: "England", national: false, logo: null },
      { id: 3, name: "Derby County W", country: "England", national: false, logo: null },
      { id: 4, name: "Derby County U19", country: "England", national: false, logo: null },
      { id: 5, name: "Derby County U23", country: "England", national: false, logo: null },
    ]);
    expect(r.status).toBe("matched");
    expect(r.team?.id).toBe(2);
  });

  it("finds 'Wolverhampton Wanderers', which the provider stores as 'Wolves'", () => {
    expect(searchTermFor("Wolverhampton Wanderers")).toBe("wolves");
    const r = resolveFromCandidates("Wolverhampton Wanderers", [
      { id: 39, name: "Wolves", country: "England", national: false, logo: null },
      { id: 40, name: "Wolverhampton City", country: "England", national: false, logo: null },
      { id: 41, name: "Wolverhampton W", country: "England", national: false, logo: null },
    ]);
    expect(r.status).toBe("matched");
    expect(r.team?.id).toBe(39);
  });

  it("matches English names of clubs stored in the local language", () => {
    const r = resolveFromCandidates("Slavia Prague", [
      { id: 10, name: "Slavia Praha", country: "Czech-Republic", national: false, logo: null },
      { id: 11, name: "Slavia Praha W", country: "Czech-Republic", national: false, logo: null },
    ]);
    expect(r.status).toBe("matched");
    expect(r.team?.id).toBe(10);
  });

  it("never turns a different club with the same city into a match", () => {
    const r = resolveFromCandidates("Manchester City", [
      { id: 33, name: "Manchester United", country: "England", national: false, logo: null },
      { id: 50, name: "Manchester City", country: "England", national: false, logo: null },
    ]);
    expect(r.team?.id).toBe(50);
    expect(resolveFromCandidates("Bristol City", [{ id: 7, name: "Bristol Rovers", country: "England", national: false, logo: null }]).status).not.toBe("matched");
  });
});
