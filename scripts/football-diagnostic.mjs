/**
 * One-off API-Football connectivity diagnostic.   Run:  npm run test:football
 *
 * - Reads API_FOOTBALL_KEY (and optional API_FOOTBALL_BASE_URL) from .env.local.
 * - Uses the same authentication as the app: header `x-apisports-key` against
 *   https://v3.football.api-sports.io (src/lib/football/api-football.ts).
 * - Makes REAL requests — no mocks. Never prints the API key.
 * - Standalone script: it is not an HTTP route and does not change the app.
 *
 * Requests made (at most 3):
 *   1. GET /status                    account, plan and daily usage
 *   2. GET /fixtures?date=<today UTC> today's fixtures (counts toward the daily quota)
 *   3. GET /teams?search=arsenal      the same lookup the app uses to identify clubs (counts toward quota)
 */
import { existsSync } from "node:fs";
import path from "node:path";

const envFile = path.resolve(".env.local");
if (!existsSync(envFile)) {
  console.error("✗ .env.local not found in the project folder.");
  process.exit(1);
}
process.loadEnvFile(envFile); // Node 20.12+ built-in dotenv parser

const KEY = (process.env.API_FOOTBALL_KEY ?? "").trim();
const BASE = (process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io").trim().replace(/\/+$/, "");

if (!KEY) {
  console.error("✗ API_FOOTBALL_KEY is missing or empty in .env.local.");
  process.exit(1);
}

/** Defensive: strip the key from anything we print. */
const safe = (v) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.split(KEY).join("[redacted]");
};

/** Normalise API-Football's `errors` field (it is [] when fine, or an object/array of messages). */
function apiErrors(body) {
  const e = body?.errors;
  if (!e) return [];
  if (Array.isArray(e)) return e.map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
  if (typeof e === "object") return Object.entries(e).map(([k, v]) => `${k}: ${v}`);
  return [String(e)];
}

function diagnose(errs) {
  const t = errs.join(" ").toLowerCase();
  if (t.includes("token") || t.includes("application key") || t.includes("api key")) {
    return "Authentication failed. Check the key at https://dashboard.api-football.com. If your key came from RapidAPI, it will not work with this endpoint (RapidAPI uses different headers and host).";
  }
  if (t.includes("request limit") || t.includes("requests")) return "Daily request quota exhausted. It resets at 00:00 UTC.";
  if (t.includes("ratelimit") || t.includes("too many")) return "Per-minute rate limit hit. Wait a minute and retry.";
  if (t.includes("plan") || t.includes("season") || t.includes("subscription")) return "Your subscription plan does not allow this request (e.g. season or parameter restriction).";
  if (t.includes("suspended") || t.includes("account")) return "There is a problem with the account. Check the dashboard.";
  return null;
}

async function call(label, pathAndQuery) {
  const url = `${BASE}${pathAndQuery}`;
  const started = Date.now();
  let res;
  // Retry once on network-level failures only (e.g. a transient DNS ENOTFOUND).
  // API errors (bad key, plan limits) are never retried.
  for (let attempt = 1; attempt <= 2 && !res; attempt++) {
    try {
      res = await fetch(url, { headers: { "x-apisports-key": KEY }, signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      const code = safe(e?.cause?.code ?? e?.message ?? String(e));
      if (attempt === 2) {
        console.log(`\n✗ ${label}\n  Network error (after retry): ${code}`);
        return { ok: false };
      }
      console.log(`  (network error on ${label.toLowerCase()}: ${code} — retrying once)`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  const ms = Date.now() - started;
  const limits = {
    dailyRemaining: res.headers.get("x-ratelimit-requests-remaining"),
    dailyLimit: res.headers.get("x-ratelimit-requests-limit"),
    minuteRemaining: res.headers.get("x-ratelimit-remaining"),
    minuteLimit: res.headers.get("x-ratelimit-limit"),
  };
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  const errs = apiErrors(body);
  const ok = res.ok && body !== null && errs.length === 0;

  console.log(`\n${ok ? "✓" : "✗"} ${label}`);
  console.log(`  GET ${pathAndQuery}  →  HTTP ${res.status} in ${ms} ms`);
  if (body === null) console.log("  Response was not JSON.");
  if (errs.length) {
    console.log("  API errors:");
    errs.forEach((e) => console.log(`    - ${safe(e)}`));
    const hint = diagnose(errs);
    if (hint) console.log(`  Diagnosis: ${hint}`);
  }
  if (body && typeof body.results === "number") console.log(`  Records returned: ${body.results}`);
  if (limits.dailyRemaining !== null || limits.minuteRemaining !== null) {
    console.log(
      `  Rate limits: daily ${limits.dailyRemaining ?? "?"}/${limits.dailyLimit ?? "?"} remaining · per-minute ${limits.minuteRemaining ?? "?"}/${limits.minuteLimit ?? "?"} remaining`,
    );
  }
  return { ok, body, status: res.status };
}

console.log("API-Football diagnostic");
console.log(`  Endpoint: ${BASE}`);
console.log(`  Auth header: x-apisports-key (key loaded from .env.local, ${KEY.length} characters, not shown)`);

// 1. Account status
const status = await call("Account status", "/status");
if (status.ok) {
  const r = status.body.response ?? {};
  const sub = r.subscription ?? {};
  const req = r.requests ?? {};
  console.log(`  Plan: ${sub.plan ?? "unknown"} · active: ${sub.active ?? "unknown"} · ends: ${sub.end ?? "n/a"}`);
  console.log(`  Requests used today: ${req.current ?? "?"} of ${req.limit_day ?? "?"}`);
}

// Stop early on authentication failure — further calls would only fail the same way.
const authFailed = status.status === 401 || status.status === 403 || (status.body && diagnose(apiErrors(status.body))?.startsWith("Authentication"));
let fixtures = { ok: false };
let teams = { ok: false };
if (!authFailed) {
  // 2. Today's fixtures
  const today = new Date().toISOString().slice(0, 10);
  fixtures = await call(`Fixtures on ${today} (UTC)`, `/fixtures?date=${today}`);
  if (fixtures.ok && Array.isArray(fixtures.body.response)) {
    const sample = fixtures.body.response.slice(0, 5);
    if (sample.length) {
      console.log("  Sample:");
      for (const f of sample) {
        console.log(`    - ${f.league?.name ?? "?"} (${f.league?.country ?? "?"}, season ${f.league?.season ?? "?"}): ${f.teams?.home?.name ?? "?"} vs ${f.teams?.away?.name ?? "?"} [${f.fixture?.status?.short ?? "?"}]`);
      }
      const seasons = [...new Set(fixtures.body.response.map((f) => f.league?.season))].filter(Boolean).sort();
      console.log(`  Seasons in response: ${seasons.join(", ")}`);
    }
  }

  // 3. Team search (the lookup the app uses to identify clubs)
  teams = await call('Team search "arsenal"', "/teams?search=arsenal");
  if (teams.ok && Array.isArray(teams.body.response)) {
    for (const t of teams.body.response.slice(0, 5)) {
      console.log(`    - #${t.team?.id} ${t.team?.name} (${t.team?.country ?? "?"})`);
    }
  }
}

const allOk = status.ok && fixtures.ok && teams.ok;
console.log(`\n${allOk ? "RESULT: ✓ API-Football connection works." : "RESULT: ✗ API-Football check did not fully succeed (see details above)."}`);
process.exit(allOk ? 0 : 1);
