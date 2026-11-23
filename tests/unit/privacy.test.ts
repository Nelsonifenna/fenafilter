import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { geminiError } from "@/lib/ai/gemini";
import { USER_MESSAGES } from "@/lib/errors";
import { FootballApiError, publicFootballMessage } from "@/lib/football/api-football";

/**
 * Regression guard: user-facing code must not reveal which providers, models
 * or storage systems power FenaFilter. Server-side integration code is exempt.
 */
const ROOT = path.resolve(__dirname, "../../src");
const USER_FACING = [
  "app/page.tsx",
  "app/not-found.tsx",
  "app/layout.tsx",
  "app/(app)",
  "components",
  "lib/client",
  "lib/examples.ts",
  "lib/filtering/metrics.ts", // descriptions are shown in the rules editor
];
const FORBIDDEN = /\b(gemini|google|api-football|api_football|apisports|vercel|blob storage|poisson|dahl|minimax|openai|BLOB_READ_WRITE_TOKEN|GEMINI_API_KEY|API_FOOTBALL_KEY|SESSION_SECRET)\b/i;

function files(p: string): string[] {
  const full = path.join(ROOT, p);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((f) => files(path.join(p, f)));
}

describe("no implementation details in user-facing code", () => {
  for (const file of USER_FACING.flatMap(files).filter((f) => /\.(tsx?|ts)$/.test(f))) {
    it(path.relative(ROOT, file), () => {
      const lines = readFileSync(file, "utf8").split("\n");
      const hits = lines
        .map((l, i) => ({ l, i }))
        // Module paths in imports and code comments are not visible to users.
        .filter(({ l }) => FORBIDDEN.test(l) && !/^\s*(import\s|\/\/|\*|\/\*)/.test(l))
        .map(({ l, i }) => `${i + 1}: ${l.trim()}`);
      expect(hits).toEqual([]);
    });
  }
});

describe("user-safe error messages", () => {
  const leaks = /gemini|google|api key|_KEY|model "|status|\(\d{3}\)/i;

  it.each([400, 401, 403, 404, 429, 500, undefined])("AI failure %s: friendly message, technical detail kept internal", (status) => {
    const err = geminiError(Object.assign(new Error("raw provider text"), { status }), "some-model-1.0");
    expect(err.message).not.toMatch(leaks);
    expect(err.message).not.toContain("some-model");
    expect(err.internal).toBeTruthy();
    if (status !== 401 && status !== 403) expect(err.internal).toContain("some-model-1.0");
  });

  it("maps rate limits to a 'busy' message", () => {
    expect(geminiError(Object.assign(new Error("x"), { status: 429 }), "m").message).toBe(USER_MESSAGES.busy);
  });

  it.each(["plan", "quota_daily", "rate_minute", "auth", "http", "other"] as const)("football failure %s never shows provider text", (kind) => {
    const msg = publicFootballMessage(new FootballApiError("API-Football says: Free plans do not have access to this season", kind));
    expect(msg).not.toMatch(/api-football|free plans|season|key/i);
    expect(msg.length).toBeGreaterThan(10);
  });
});
