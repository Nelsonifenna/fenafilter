import { describe, expect, it } from "vitest";
import { MISSING_SESSION_SECRET_MESSAGE, resolveSessionSecret } from "@/lib/config/env";

// Test-only placeholder values — not real secrets.
const GOOD = "x".repeat(40);
const random = () => "r".repeat(64);
const base = { secret: undefined as string | undefined, nodeEnv: "development", isVercel: false, nextPhase: undefined as string | undefined, random };

describe("resolveSessionSecret", () => {
  it("uses SESSION_SECRET when set (any environment)", () => {
    expect(resolveSessionSecret({ ...base, secret: GOOD })).toEqual({ secret: GOOD, isEphemeral: false });
    expect(resolveSessionSecret({ ...base, secret: GOOD, nodeEnv: "production" })).toEqual({ secret: GOOD, isEphemeral: false });
  });

  it("refuses to run in production without SESSION_SECRET", () => {
    expect(() => resolveSessionSecret({ ...base, nodeEnv: "production" })).toThrow(MISSING_SESSION_SECRET_MESSAGE);
  });

  it("refuses to run on Vercel without SESSION_SECRET, even if NODE_ENV is not production", () => {
    expect(() => resolveSessionSecret({ ...base, isVercel: true })).toThrow(/required in production/);
  });

  it("allows `next build` without SESSION_SECRET using a throwaway random secret", () => {
    const r = resolveSessionSecret({ ...base, nodeEnv: "production", nextPhase: "phase-production-build" });
    expect(r).toEqual({ secret: random(), isEphemeral: true });
  });

  it("uses a random per-process secret in development — never a hard-coded one", () => {
    const r = resolveSessionSecret({ ...base });
    expect(r.isEphemeral).toBe(true);
    expect(r.secret).toBe(random());
  });

  it("rejects short secrets without echoing the value", () => {
    const short = "short-secret-value";
    try {
      resolveSessionSecret({ ...base, secret: short, nodeEnv: "production" });
      throw new Error("expected to throw");
    } catch (e) {
      expect((e as Error).message).toMatch(/at least 32 characters/);
      expect((e as Error).message).not.toContain(short);
    }
  });
});
