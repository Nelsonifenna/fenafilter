import "server-only";
import { cached, cacheKey } from "../cache";
import { getEnv } from "../config/env";
import { AppError, USER_MESSAGES } from "../errors";
import { getStore, keys } from "../storage";

/**
 * API-Football v3 client (direct API-Sports subscription).
 *   Base URL: https://v3.football.api-sports.io
 *   Auth header: x-apisports-key
 *
 * Note: the official documentation site blocks automated readers, so the
 * response shapes below follow the long-stable v3 format, and every response
 * is defensively checked. API-Football reports most problems (bad key, plan
 * restrictions, quota) inside an `errors` field with HTTP 200 — handled here.
 */

export interface ApiEnvelope<T> {
  errors: unknown;
  results: number;
  response: T[];
}

export interface ApiTeam {
  team: { id: number; name: string; country: string | null; national: boolean; logo: string | null };
}
export interface ApiLeague {
  league: { id: number; name: string; type: string };
  country: { name: string | null };
}
export interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string } };
  league: { id: number; name: string; country: string | null; season: number };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  goals: { home: number | null; away: number | null };
}
export interface ApiPrediction {
  predictions: { advice: string | null; percent: { home: string | null; draw: string | null; away: string | null } };
}

/** User-facing wording for football-data failures (provider details stay in logs). */
export function publicFootballMessage(e: FootballApiError): string {
  switch (e.kind) {
    case "quota_daily":
      return "Football statistics have reached today's limit. Please try again tomorrow.";
    case "rate_minute":
      return "Football statistics are busy right now. Please try again in a minute.";
    default:
      return USER_MESSAGES.statisticsUnavailable;
  }
}

export class FootballApiError extends Error {
  constructor(
    message: string,
    readonly kind: "plan" | "quota_daily" | "rate_minute" | "auth" | "http" | "other",
  ) {
    super(message);
  }
}

// Per-minute limiter state (from response headers). Per instance.
let minuteRemaining: number | null = null;
let minuteResetAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function classifyApiErrors(errors: unknown): FootballApiError | null {
  if (!errors) return null;
  const entries: [string, string][] = Array.isArray(errors)
    ? errors.map((e, i) => [String(i), typeof e === "string" ? e : JSON.stringify(e)])
    : typeof errors === "object"
      ? Object.entries(errors as Record<string, unknown>).map(([k, v]) => [k, String(v)])
      : [];
  if (entries.length === 0) return null;
  const [k, msg] = entries[0]!;
  const lower = `${k} ${msg}`.toLowerCase();
  if (lower.includes("ratelimit") || lower.includes("too many requests")) return new FootballApiError(msg, "rate_minute");
  if (k === "requests" || lower.includes("request limit")) return new FootballApiError("API-Football daily request limit reached.", "quota_daily");
  if (k === "token" || lower.includes("api key") || lower.includes("token")) return new FootballApiError("API-Football rejected the API key. Check API_FOOTBALL_KEY.", "auth");
  if (k === "plan" || lower.includes("plan") || lower.includes("subscription") || lower.includes("access to this")) return new FootballApiError(msg, "plan");
  return new FootballApiError(msg, "other");
}

async function rawGet<T>(path: string, params: Record<string, string | number>): Promise<ApiEnvelope<T>> {
  const env = getEnv();
  if (!env.football.apiKey) {
    throw new AppError("SERVICE_NOT_CONFIGURED", USER_MESSAGES.statisticsUnavailable, { internal: "API_FOOTBALL_KEY is not set" });
  }
  const url = new URL(path, env.football.baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 0; attempt < 3; attempt++) {
    if (minuteRemaining !== null && minuteRemaining <= 0 && Date.now() < minuteResetAt) {
      await sleep(Math.min(61_000, minuteResetAt - Date.now()));
    }
    const res = await fetch(url, { headers: { "x-apisports-key": env.football.apiKey }, signal: AbortSignal.timeout(20_000) });
    const perMin = res.headers.get("x-ratelimit-remaining");
    if (perMin !== null) {
      minuteRemaining = Number(perMin);
      if (minuteRemaining <= 0) minuteResetAt = Date.now() + 60_000;
    }
    if (res.status === 429) {
      minuteRemaining = 0;
      minuteResetAt = Date.now() + 60_000;
      continue;
    }
    if (!res.ok) throw new FootballApiError(`API-Football HTTP ${res.status}`, res.status === 401 || res.status === 403 ? "auth" : "http");
    const body = (await res.json()) as ApiEnvelope<T>;
    const err = classifyApiErrors(body.errors);
    if (err?.kind === "rate_minute") {
      minuteRemaining = 0;
      minuteResetAt = Date.now() + 60_000;
      continue;
    }
    if (err) throw err;
    return { errors: null, results: body.results ?? 0, response: Array.isArray(body.response) ? body.response : [] };
  }
  throw new FootballApiError("API-Football per-minute rate limit kept being exceeded.", "rate_minute");
}

/* ------------------------------------------------------------------ */
/* Plan restrictions                                                   */
/* ------------------------------------------------------------------ */
/*
 * Verified live (Nov 2026): the free plan rejects the "last" parameter
 * ("Free plans do not have access to the Last parameter") and recent seasons
 * ("…do not have access to this season, try from 2022 to 2024"). Rejected
 * requests are not cached and still use quota, so restrictions are remembered
 * for a day and not requested again.
 */
const PLAN_TTL_MS = 24 * 3600_000;
const blocked = new Map<string, number>();

/** "param:last" or "season:2026" — derived from the provider's plan message. */
export function planRestrictionKey(e: FootballApiError, season?: number): string | null {
  if (e.kind !== "plan") return null;
  const m = e.message.toLowerCase();
  if (m.includes("last parameter")) return "param:last";
  if (m.includes("season") && season !== undefined) return `season:${season}`;
  return null;
}

export async function isPlanBlocked(key: string): Promise<boolean> {
  const now = Date.now();
  const mem = blocked.get(key);
  if (mem !== undefined) return mem > now;
  try {
    const obj = await getStore().get(keys.cache("football-plan", cacheKey(key)));
    const until = obj ? Number(JSON.parse(obj.body.toString("utf8")).until) : 0;
    blocked.set(key, until);
    return until > now;
  } catch {
    return false;
  }
}

export async function markPlanBlocked(key: string): Promise<void> {
  const until = Date.now() + PLAN_TTL_MS;
  blocked.set(key, until);
  try {
    await getStore().put(keys.cache("football-plan", cacheKey(key)), JSON.stringify({ key, until }), "application/json", { ttlDays: 1 });
  } catch {
    /* memory copy still prevents repeats on this instance */
  }
}

const HOUR = 3600;
const DAY = 86400;

export function apiGet<T>(path: string, params: Record<string, string | number>, ttlSeconds: number) {
  return cached(`football`, cacheKey(path, params), ttlSeconds, () => rawGet<T>(path, params));
}

export const footballApi = {
  searchTeams: (term: string) => apiGet<ApiTeam>("/teams", { search: term }, 7 * DAY),
  searchLeagues: (term: string) => apiGet<ApiLeague>("/leagues", { search: term }, 7 * DAY),
  lastFixtures: (teamId: number, n = 15) => apiGet<ApiFixture>("/fixtures", { team: teamId, last: n }, 6 * HOUR),
  seasonFixtures: (teamId: number, season: number) => apiGet<ApiFixture>("/fixtures", { team: teamId, season }, 6 * HOUR),
  nextFixtures: (teamId: number, n = 5) => apiGet<ApiFixture>("/fixtures", { team: teamId, next: n }, 6 * HOUR),
  prediction: (fixtureId: number) => apiGet<ApiPrediction>("/predictions", { fixture: fixtureId }, 6 * HOUR),
  /** Previous meetings between two clubs (all competitions). */
  headToHead: (teamA: number, teamB: number) => apiGet<ApiFixture>("/fixtures/headtohead", { h2h: `${teamA}-${teamB}` }, 12 * HOUR),
  /** Every fixture of a league season (one request per league, shared by all fixtures in it). */
  leagueFixtures: (leagueId: number, season: number) => apiGet<ApiFixture>("/fixtures", { league: leagueId, season }, 12 * HOUR),
};
