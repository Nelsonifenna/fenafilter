import "server-only";
import { getEnv } from "../config/env";
import { logError } from "../errors";
import type { Fixture, FixtureStats, RecentMatch, TeamData, TeamResolution } from "../domain/schemas";
import { footballApi, FootballApiError, isPlanBlocked, markPlanBlocked, planRestrictionKey, type ApiFixture } from "./api-football";
import type { DataNeeds } from "../filtering/engine";
import { identifyLeague, summarizeLeague, toH2H } from "./context";
import { resolvePair, toRecentMatches, type SearchCandidate } from "./resolver";
import { isStale } from "./stats";
import { basicNormalize, searchTermFor } from "./team-names";

/**
 * Football data service: identifies both clubs of a fixture and collects
 * their recent finished matches from API-Football. All derived statistics are
 * computed later from these raw results (see stats.ts / poisson.ts), so every
 * number shown to the user can be traced back to real matches.
 */

const RECENT_COUNT = 15;

async function searchCandidates(name: string): Promise<SearchCandidate[]> {
  const term = searchTermFor(name);
  if (!term) return [];
  const res = await footballApi.searchTeams(term);
  return res.response.map((r) => ({
    id: r.team.id,
    name: r.team.name,
    country: r.team.country ?? null,
    national: Boolean(r.team.national),
    logo: r.team.logo ?? null,
  }));
}

/** Country of the competition, only when the name maps to exactly one country. */
async function competitionCountry(competition: string | null): Promise<string | null> {
  if (!competition) return null;
  const term = basicNormalize(competition).split(" ").filter((t) => t.length >= 3).slice(0, 3).join(" ");
  if (term.length < 3) return null;
  try {
    const res = await footballApi.searchLeagues(term);
    const exact = res.response.filter((l) => basicNormalize(l.league.name) === basicNormalize(competition));
    const countries = new Set(exact.map((l) => l.country.name).filter((c): c is string => Boolean(c) && c !== "World"));
    return countries.size === 1 ? [...countries][0]! : null;
  } catch {
    return null;
  }
}

function currentSeasonStartYear(now = new Date()) {
  // European seasons start mid-year; calendar-year leagues are covered by the fallback.
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

async function recentMatches(teamId: number): Promise<{ matches: RecentMatch[]; note: string | null }> {
  if (!(await isPlanBlocked("param:last"))) {
    try {
      const res = await footballApi.lastFixtures(teamId, RECENT_COUNT);
      return { matches: toRecentMatches(teamId, res.response), note: null };
    } catch (e) {
      if (!(e instanceof FootballApiError) || e.kind !== "plan") throw e;
      const key = planRestrictionKey(e);
      if (key) await markPlanBlocked(key);
    }
  }
  // Plan does not allow `last`: fall back to whole seasons, newest accessible first.
  const start = currentSeasonStartYear();
  for (const season of [start, start - 1, start - 2, start - 3]) {
    if (await isPlanBlocked(`season:${season}`)) continue;
    try {
      const res = await footballApi.seasonFixtures(teamId, season);
      const matches = toRecentMatches(teamId, res.response as ApiFixture[]).slice(0, RECENT_COUNT);
      if (matches.length > 0) {
        return { matches, note: season < start ? `Only older match data was available (season ${season}/${String(season + 1).slice(-2)}), so figures may be outdated.` : null };
      }
    } catch (e) {
      if (e instanceof FootballApiError && e.kind === "plan") {
        const key = planRestrictionKey(e, season);
        if (key) await markPlanBlocked(key);
        logError(`football plan restriction (team ${teamId}, season ${season})`, e);
        continue;
      }
      throw e;
    }
  }
  return { matches: [], note: "No recent finished matches were available for this club." };
}

function teamData(resolution: TeamResolution, matches: RecentMatch[], error: string | null): TeamData {
  const dataAsOf = matches[0]?.date ?? null;
  return { resolution, recent: matches, dataAsOf, stale: matches.length > 0 && isStale(dataAsOf), error };
}

async function fetchTeam(resolution: TeamResolution): Promise<TeamData> {
  if (resolution.status !== "matched" || !resolution.team) return teamData(resolution, [], null);
  try {
    const { matches, note } = await recentMatches(resolution.team.id);
    return teamData(resolution, matches, note);
  } catch (e) {
    if (e instanceof FootballApiError && (e.kind === "quota_daily" || e.kind === "auth" || e.kind === "rate_minute")) throw e;
    logError(`football team ${resolution.team.id}`, e);
    return teamData(resolution, [], "Recent matches for this club could not be loaded.");
  }
}

export interface TeamOverrides {
  home?: number;
  away?: number;
}

const ALL_NEEDS: DataNeeds = { teams: true, h2h: true, league: true, competitionLookup: true };

/** Errors that must stop the whole statistics step (they would fail for every fixture). */
const isFatal = (e: unknown) => e instanceof FootballApiError && (e.kind === "quota_daily" || e.kind === "auth" || e.kind === "rate_minute");

export async function collectFixtureStats(fixture: Fixture, overrides: TeamOverrides = {}, needs: DataNeeds = ALL_NEEDS): Promise<FixtureStats> {
  const env = getEnv();
  const [homeCands, awayCands, country] = await Promise.all([
    searchCandidates(fixture.homeTeam),
    searchCandidates(fixture.awayTeam),
    competitionCountry(fixture.competition),
  ]);
  let { home, away } = resolvePair(fixture.homeTeam, fixture.awayTeam, homeCands, awayCands, country);

  // User picked a specific club from the candidate list.
  const applyOverride = (r: TeamResolution, id: number | undefined, cands: SearchCandidate[]): TeamResolution => {
    if (!id) return r;
    const c = cands.find((x) => x.id === id) ?? r.candidates.find((x) => x.id === id);
    if (!c) return r;
    return { ...r, status: "matched", method: "manual", team: { id: c.id, name: c.name, country: c.country, logo: c.logo, score: 1 }, message: null };
  };
  home = applyOverride(home, overrides.home, homeCands);
  away = applyOverride(away, overrides.away, awayCands);

  const homeData = await fetchTeam(home);
  const awayData = await fetchTeam(away);
  const notes: string[] = [];

  // League: identified from both clubs' real fixtures (or the screenshot name as a fallback).
  const league = identifyLeague(homeData.recent, awayData.recent, fixture.competition);
  let leagueStats: FixtureStats["leagueStats"] = null;
  if (needs.league && league && (await isPlanBlocked(`season:${league.season}`))) {
    notes.push(`League figures for ${league.name} are not available for this season.`);
  } else if (needs.league && league) {
    try {
      const res = await footballApi.leagueFixtures(league.id, league.season);
      leagueStats = summarizeLeague(res.response);
      if (!leagueStats) notes.push(`No finished ${league.name} matches were available for this season.`);
    } catch (e) {
      if (isFatal(e)) throw e;
      if (e instanceof FootballApiError) {
        const key = planRestrictionKey(e, league.season);
        if (key) await markPlanBlocked(key);
      }
      logError(`football league ${league.id}/${league.season}`, e);
      notes.push(`League figures for ${league.name} could not be loaded.`);
    }
  } else if (needs.league && !league) {
    notes.push("The league for this fixture could not be identified from the clubs' recent matches.");
  }

  // Previous meetings between the two clubs.
  let h2h: FixtureStats["h2h"] = null;
  if (needs.h2h && home.team && away.team && home.status === "matched" && away.status === "matched") {
    try {
      const res = await footballApi.headToHead(home.team.id, away.team.id);
      h2h = toH2H(res.response);
    } catch (e) {
      if (isFatal(e)) throw e;
      logError(`football h2h ${home.team.id}-${away.team.id}`, e);
      notes.push("Previous meetings between these clubs could not be loaded.");
    }
  }

  let prediction: FixtureStats["prediction"] = null;
  if (env.football.enablePredictions && home.team && away.team) {
    try {
      const next = await footballApi.nextFixtures(home.team.id, 5);
      const match = next.response.find((f) => f.teams.home.id === home.team!.id && f.teams.away.id === away.team!.id);
      if (match) {
        const p = await footballApi.prediction(match.fixture.id);
        const pct = (s: string | null | undefined) => (s ? Number.parseFloat(s) / 100 : null);
        const first = p.response[0];
        if (first) {
          prediction = {
            apiFixtureId: match.fixture.id,
            percentHome: pct(first.predictions.percent.home),
            percentDraw: pct(first.predictions.percent.draw),
            percentAway: pct(first.predictions.percent.away),
            advice: first.predictions.advice ?? null,
          };
        }
      }
    } catch {
      /* predictions are optional */
    }
  }

  return {
    fixtureId: fixture.id,
    home: homeData,
    away: awayData,
    prediction,
    league,
    leagueStats,
    h2h,
    notes,
    fetchedAt: new Date().toISOString(),
    source: "API-Football v3",
  };
}
