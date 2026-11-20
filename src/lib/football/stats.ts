import type { RecentMatch } from "../domain/schemas";

/**
 * Descriptive statistics computed from a team's real, finished matches.
 * These are HISTORICAL FREQUENCIES, not predictions.
 */
export interface Split {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  avgFor: number | null;
  avgAgainst: number | null;
  bttsRate: number | null;
  cleanSheetRate: number | null;
  failedToScoreRate: number | null;
  over25Rate: number | null;
}

export interface TeamProfile {
  overall: Split;
  home: Split;
  away: Split;
  /** Most recent first, e.g. "WWDLW" */
  form: string;
  formPointsPerGame: number | null;
  formSample: number;
}

/** Minimum matches before we compute anything for a team. */
export const MIN_MATCHES = 5;
/** Matches used for form. */
export const FORM_WINDOW = 6;

export function computeSplit(matches: RecentMatch[]): Split {
  const n = matches.length;
  let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0, btts = 0, cs = 0, fts = 0, o25 = 0;
  for (const m of matches) {
    gf += m.goalsFor;
    ga += m.goalsAgainst;
    if (m.goalsFor > m.goalsAgainst) wins++;
    else if (m.goalsFor === m.goalsAgainst) draws++;
    else losses++;
    if (m.goalsFor > 0 && m.goalsAgainst > 0) btts++;
    if (m.goalsAgainst === 0) cs++;
    if (m.goalsFor === 0) fts++;
    if (m.goalsFor + m.goalsAgainst > 2.5) o25++;
  }
  const rate = (k: number) => (n > 0 ? k / n : null);
  return {
    played: n,
    wins,
    draws,
    losses,
    goalsFor: gf,
    goalsAgainst: ga,
    avgFor: rate(gf),
    avgAgainst: rate(ga),
    bttsRate: rate(btts),
    cleanSheetRate: rate(cs),
    failedToScoreRate: rate(fts),
    over25Rate: rate(o25),
  };
}

export function computeTeamProfile(recent: RecentMatch[]): TeamProfile {
  const sorted = [...recent].sort((a, b) => b.date.localeCompare(a.date));
  const formMatches = sorted.slice(0, FORM_WINDOW);
  let pts = 0;
  const form = formMatches
    .map((m) => {
      if (m.goalsFor > m.goalsAgainst) {
        pts += 3;
        return "W";
      }
      if (m.goalsFor === m.goalsAgainst) {
        pts += 1;
        return "D";
      }
      return "L";
    })
    .join("");
  return {
    overall: computeSplit(sorted),
    home: computeSplit(sorted.filter((m) => m.venue === "home")),
    away: computeSplit(sorted.filter((m) => m.venue === "away")),
    form,
    formPointsPerGame: formMatches.length > 0 ? pts / formMatches.length : null,
    formSample: formMatches.length,
  };
}

/** Pick the venue split if it has enough games, otherwise fall back to overall. */
export function venueSplit(profile: TeamProfile, venue: "home" | "away", minVenueGames = 3): { split: Split; usedVenue: boolean } {
  const s = profile[venue];
  if (s.played >= minVenueGames) return { split: s, usedVenue: true };
  return { split: profile.overall, usedVenue: false };
}

/** Data is stale if the most recent match is older than `maxAgeDays`. */
export function isStale(dataAsOf: string | null, now = new Date(), maxAgeDays = 45): boolean {
  if (!dataAsOf) return true;
  const age = (now.getTime() - new Date(dataAsOf).getTime()) / 86_400_000;
  return age > maxAgeDays;
}
