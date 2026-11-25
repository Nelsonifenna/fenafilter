import { describe, expect, it } from "vitest";
import { geminiError } from "@/lib/ai/gemini";
import { AiExhaustedError } from "@/lib/ai/resilience";
import { JOB_RETRY_DELAYS_S, nextJobRetry, retryMessage, retryPending } from "@/lib/jobs/retry";

// Regression: a sustained provider overload must not fail an analysis on the first round.
const overload = () => Object.assign(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'), { status: 503 });

describe("job-level retry scheduling", () => {
  const now = Date.parse("2026-11-23T12:00:00Z");

  it("schedules increasing delays, then stops", () => {
    let state = null as ReturnType<typeof nextJobRetry>;
    const delays: number[] = [];
    for (let i = 0; i < JOB_RETRY_DELAYS_S.length; i++) {
      state = nextJobRetry(state, now);
      expect(state).not.toBeNull();
      delays.push((Date.parse(state!.at) - now) / 1000);
    }
    expect(delays).toEqual([20, 40, 60, 90]);
    expect(nextJobRetry(state, now)).toBeNull();
  });

  it("blocks the worker until the retry is due", () => {
    const r = nextJobRetry(null, now)!;
    expect(retryPending(r, now)).toBe(true);
    expect(retryPending(r, now + 21_000)).toBe(false);
    expect(retryPending(null, now)).toBe(false);
    expect(retryPending(undefined, now)).toBe(false);
  });

  it("produces a plain-language progress note without provider details", () => {
    const msg = retryMessage(nextJobRetry(null, now)!, now);
    expect(msg).toMatch(/Trying again automatically in 20 s/);
    expect(msg).not.toMatch(/gemini|503|model/i);
  });
});

describe("transient flag used by the pipeline", () => {
  it("marks exhausted overloads and network failures as transient", () => {
    expect(geminiError(new AiExhaustedError(overload(), "m", 4), "m").details).toEqual({ transient: true });
    expect(geminiError(new Error("fetch failed"), "m").details).toEqual({ transient: true });
  });
  it("does not retry configuration or request errors", () => {
    for (const status of [400, 401, 403, 404]) {
      expect(geminiError(Object.assign(new Error("x"), { status }), "m").details).toEqual({ transient: false });
    }
  });
});
