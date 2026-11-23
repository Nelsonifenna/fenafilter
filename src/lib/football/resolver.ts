import type { RecentMatch, TeamCandidate, TeamResolution } from "../domain/schemas";
import { basicNormalize, canonicalName, isAlias, similarity } from "./team-names";

/**
 * Pure team-identity resolution (no network). Given API search candidates it
 * decides matched / ambiguous / not_found. Conservative by design: when two
 * clubs are plausible, it returns "ambiguous" so the user can choose.
 */

export interface SearchCandidate {
  id: number;
  name: string;
  country: string | null;
  national: boolean;
  logo: string | null;
}

const RESERVE_RE = /\b(u ?17|u ?18|u ?19|u ?20|u ?21|u ?23|women|w|ii|b|res|reserves|youth|academy|fem|femenino|feminine|frauen)\b/;
/** Suffixes the data provider often drops from first-team names ("Derby County" is stored as "Derby"). */
const GENERIC_SUFFIX = /\s(county|town|city|united|athletic|albion|rovers|wanderers)$/;

export const MATCH_THRESHOLD = 0.85;
export const FUZZY_THRESHOLD = 0.72;
export const AMBIGUITY_MARGIN = 0.08;

export function scoreCandidates(query: string, candidates: SearchCandidate[], countryHint?: string | null): TeamCandidate[] {
  const qBasic = basicNormalize(query);
  const queryIsReserve = RESERVE_RE.test(qBasic);
  return candidates
    .map((c) => {
      let s = similarity(query, c.name);
      // "Derby County" → candidate "Derby": same club, short name. Only when the rest is a generic suffix.
      const qCanon = canonicalName(query);
      if (GENERIC_SUFFIX.test(qCanon) && canonicalName(c.name) === qCanon.replace(GENERIC_SUFFIX, "")) s = Math.max(s, 0.92);
      const cBasic = basicNormalize(c.name);
      if (!queryIsReserve && RESERVE_RE.test(cBasic)) s -= 0.3;
      if (c.national && canonicalName(c.name) !== canonicalName(query)) s -= 0.2;
      if (countryHint && c.country) s += c.country.toLowerCase() === countryHint.toLowerCase() ? 0.1 : -0.1;
      return { id: c.id, name: c.name, country: c.country, logo: c.logo, score: Math.round(Math.max(0, Math.min(1.1, s)) * 1000) / 1000 };
    })
    .sort((a, b) => b.score - a.score);
}

export function resolveFromCandidates(query: string, candidates: SearchCandidate[], countryHint?: string | null): TeamResolution {
  if (!query.trim()) {
    return { query, status: "not_found", method: null, team: null, candidates: [], message: "No team name was extracted." };
  }
  const scored = scoreCandidates(query, candidates, countryHint);
  const top = scored.slice(0, 5);
  const best = scored[0];
  if (!best || best.score < FUZZY_THRESHOLD) {
    return {
      query,
      status: top.length && best && best.score >= 0.5 ? "ambiguous" : "not_found",
      method: null,
      team: null,
      candidates: top,
      message: top.length ? "No confident match. Please choose the correct club." : "No club with this name was found.",
    };
  }
  const second = scored.find((c) => c.id !== best.id);
  const close = second && best.score - second.score < AMBIGUITY_MARGIN;
  if (close) {
    return {
      query,
      status: "ambiguous",
      method: null,
      team: null,
      candidates: top,
      message: `Several clubs match "${query}" (e.g. ${best.name}${best.country ? `, ${best.country}` : ""} and ${second.name}${second.country ? `, ${second.country}` : ""}).`,
    };
  }
  const exact = basicNormalize(best.name) === basicNormalize(query);
  const method: TeamResolution["method"] = exact
    ? "exact"
    : isAlias(query)
      ? "alias"
      : canonicalName(best.name) === canonicalName(query)
        ? "normalized"
        : "fuzzy";
  if (best.score < MATCH_THRESHOLD && method === "fuzzy") {
    return { query, status: "ambiguous", method: null, team: null, candidates: top, message: `Best guess is ${best.name}, but the match is not certain.` };
  }
  return { query, status: "matched", method, team: best, candidates: top, message: null };
}

/**
 * Resolve both teams together. Clubs in the same fixture are usually from the
 * same country, so a confident match on one side breaks ties on the other.
 */
export function resolvePair(
  homeQuery: string,
  awayQuery: string,
  homeCands: SearchCandidate[],
  awayCands: SearchCandidate[],
  leagueCountry: string | null,
): { home: TeamResolution; away: TeamResolution } {
  let home = resolveFromCandidates(homeQuery, homeCands, leagueCountry);
  let away = resolveFromCandidates(awayQuery, awayCands, leagueCountry);
  if (!leagueCountry) {
    if (home.status === "matched" && away.status === "ambiguous" && home.team?.country) {
      away = resolveFromCandidates(awayQuery, awayCands, home.team.country);
    } else if (away.status === "matched" && home.status === "ambiguous" && away.team?.country) {
      home = resolveFromCandidates(homeQuery, homeCands, away.team.country);
    }
  }
  return { home, away };
}

/** Convert API fixtures into the team's perspective; only finished matches with scores. */
export function toRecentMatches(
  teamId: number,
  fixtures: { fixture: { id: number; date: string; status: { short: string } }; league: { name: string; id?: number; country?: string | null; season?: number }; teams: { home: { id: number; name: string }; away: { id: number; name: string } }; goals: { home: number | null; away: number | null } }[],
): RecentMatch[] {
  const FINISHED = new Set(["FT", "AET", "PEN"]);
  return fixtures
    .filter((f) => FINISHED.has(f.fixture.status.short) && f.goals.home !== null && f.goals.away !== null)
    .filter((f) => f.teams.home.id === teamId || f.teams.away.id === teamId)
    .map((f) => {
      const isHome = f.teams.home.id === teamId;
      return {
        fixtureId: f.fixture.id,
        date: f.fixture.date,
        competition: f.league.name,
        venue: isHome ? ("home" as const) : ("away" as const),
        opponent: isHome ? f.teams.away.name : f.teams.home.name,
        goalsFor: (isHome ? f.goals.home : f.goals.away)!,
        goalsAgainst: (isHome ? f.goals.away : f.goals.home)!,
        ...(f.league.id !== undefined ? { leagueId: f.league.id } : {}),
        ...(f.league.country !== undefined ? { country: f.league.country } : {}),
        ...(f.league.season !== undefined ? { season: f.league.season } : {}),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
