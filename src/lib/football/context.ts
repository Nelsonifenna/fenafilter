import type { FixtureStats, LeagueStats, RecentMatch } from "../domain/schemas";
import { basicNormalize } from "./team-names";

/**
 * Pure helpers (no network) that turn raw match lists into league and
 * head-to-head context. Every figure is computed from real finished matches.
 */

export type FixtureLeague = NonNullable<FixtureStats["league"]>;
export type H2H = NonNullable<FixtureStats["h2h"]>;

/** Minimum finished league matches before league-wide figures are used. */
export const MIN_LEAGUE_MATCHES = 20;
/** Minimum previous meetings before head-to-head figures are used. */
export const MIN_H2H_MEETINGS = 3;
/** Head-to-head meetings considered (most recent first). */
export const H2H_WINDOW = 10;

/**
 * Identify the league a fixture belongs to: the competition (same id and season)
 * that BOTH clubs have played in most recently and most often. If they share
 * none (e.g. a cup tie or a newly promoted club), fall back to a competition in
 * either club's history whose name matches the one shown on the screenshot.
 */
export function identifyLeague(home: RecentMatch[], away: RecentMatch[], screenshotCompetition: string | null): FixtureLeague | null {
  const key = (m: RecentMatch) => (m.leagueId !== undefined && m.season !== undefined ? `${m.leagueId}:${m.season}` : null);
  const tally = (list: RecentMatch[]) => {
    const t = new Map<string, { m: RecentMatch; n: number; latest: string }>();
    for (const m of list) {
      const k = key(m);
      if (!k) continue;
      const cur = t.get(k);
      if (cur) {
        cur.n++;
        if (m.date > cur.latest) cur.latest = m.date;
      } else t.set(k, { m, n: 1, latest: m.date });
    }
    return t;
  };
  const th = tally(home);
  const ta = tally(away);
  const shared = [...th.keys()].filter((k) => ta.has(k));
  if (shared.length) {
    shared.sort((x, y) => {
      const nx = th.get(x)!.n + ta.get(x)!.n;
      const ny = th.get(y)!.n + ta.get(y)!.n;
      if (ny !== nx) return ny - nx;
      return (th.get(y)!.latest > th.get(x)!.latest ? 1 : -1);
    });
    const m = th.get(shared[0]!)!.m;
    return { id: m.leagueId!, name: m.competition, country: m.country ?? null, season: m.season!, identifiedBy: "shared_matches" };
  }
  if (screenshotCompetition) {
    const target = basicNormalize(screenshotCompetition);
    const all = [...th.values(), ...ta.values()].sort((x, y) => (y.latest > x.latest ? 1 : -1));
    const hit = all.find(({ m }) => {
      const n = basicNormalize(m.competition);
      return n === target || (target.length >= 4 && (n.includes(target) || target.includes(n)));
    });
    if (hit) return { id: hit.m.leagueId!, name: hit.m.competition, country: hit.m.country ?? null, season: hit.m.season!, identifiedBy: "screenshot_name" };
  }
  return null;
}

interface RawFixture {
  fixture: { date: string; status: { short: string } };
  goals: { home: number | null; away: number | null };
  teams?: { home: { id: number; name: string }; away: { id: number; name: string } };
  league?: { name: string };
}

const FINISHED = new Set(["FT", "AET", "PEN"]);
const finished = (list: RawFixture[]) => list.filter((f) => FINISHED.has(f.fixture.status.short) && f.goals.home !== null && f.goals.away !== null);

/** League-wide figures from a season's fixtures. Null when there are no finished matches. */
export function summarizeLeague(fixtures: RawFixture[]): LeagueStats | null {
  const done = finished(fixtures);
  const n = done.length;
  if (n === 0) return null;
  let total = 0, home = 0, away = 0, btts = 0, o05 = 0, o15 = 0, o25 = 0, o35 = 0;
  let latest: string | null = null;
  for (const f of done) {
    const h = f.goals.home!, a = f.goals.away!, g = h + a;
    total += g;
    home += h;
    away += a;
    if (h > 0 && a > 0) btts++;
    if (g > 0.5) o05++;
    if (g > 1.5) o15++;
    if (g > 2.5) o25++;
    if (g > 3.5) o35++;
    if (!latest || f.fixture.date > latest) latest = f.fixture.date;
  }
  return {
    matches: n,
    avgGoals: total / n,
    homeGoalsAvg: home / n,
    awayGoalsAvg: away / n,
    bttsRate: btts / n,
    over05Rate: o05 / n,
    over15Rate: o15 / n,
    over25Rate: o25 / n,
    over35Rate: o35 / n,
    dataAsOf: latest,
  };
}

/** Previous meetings, most recent first, limited to the last H2H_WINDOW. */
export function toH2H(fixtures: RawFixture[]): H2H {
  const meetings = finished(fixtures)
    .filter((f) => f.teams)
    .map((f) => ({
      date: f.fixture.date,
      competition: f.league?.name ?? "",
      homeTeam: f.teams!.home.name,
      awayTeam: f.teams!.away.name,
      homeGoals: f.goals.home!,
      awayGoals: f.goals.away!,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, H2H_WINDOW);
  return { meetings, dataAsOf: meetings[0]?.date ?? null };
}

export function h2hFigures(h2h: H2H) {
  const n = h2h.meetings.length;
  if (n === 0) return null;
  let total = 0, btts = 0;
  for (const m of h2h.meetings) {
    total += m.homeGoals + m.awayGoals;
    if (m.homeGoals > 0 && m.awayGoals > 0) btts++;
  }
  return {
    meetings: n,
    avgGoals: total / n,
    bttsRate: btts / n,
    overRate: (line: number) => h2h.meetings.filter((m) => m.homeGoals + m.awayGoals > line).length / n,
  };
}

export function leagueOverRate(stats: LeagueStats, line: number): number | null {
  if (line === 0.5) return stats.over05Rate;
  if (line === 1.5) return stats.over15Rate;
  if (line === 2.5) return stats.over25Rate;
  if (line === 3.5) return stats.over35Rate;
  return null;
}
