import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { geminiError } from "@/lib/ai/gemini";
import { AiExhaustedError, callWithFallback, classifyAiError, parseModelList } from "@/lib/ai/resilience";
import { USER_MESSAGES } from "@/lib/errors";
import { prepareTileImage } from "@/lib/vision/gemini";

/**
 * Regression tests for the live failure of Nov 2026:
 * the configured model answered every request with
 *   503 UNAVAILABLE "This model is currently experiencing high demand…"
 * and the app gave up after the first 503 (the SDK does not retry by default).
 */

// Exact shape of the provider error observed in production (ApiError with numeric status).
const highDemand503 = () =>
  Object.assign(
    new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}'),
    { status: 503 },
  );
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const noSleep = async () => {};

function scripted(responses: Record<string, (Error | string)[]>) {
  const calls: string[] = [];
  const call = async (model: string) => {
    calls.push(model);
    const next = responses[model]?.shift();
    if (next === undefined) throw new Error(`unexpected call to ${model}`);
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, call };
}

describe("classifyAiError", () => {
  it("treats overload, server errors and network failures as retryable", () => {
    expect(classifyAiError(highDemand503())).toBe("retry");
    for (const s of [500, 502, 504]) expect(classifyAiError(httpError(s))).toBe("retry");
    expect(classifyAiError(new Error("fetch failed"))).toBe("retry"); // no status
  });
  it("moves to the next model on retired models and quota", () => {
    expect(classifyAiError(httpError(404))).toBe("next-model");
    expect(classifyAiError(httpError(429))).toBe("next-model");
  });
  it("fails fast on bad requests and bad keys", () => {
    for (const s of [400, 401, 403]) expect(classifyAiError(httpError(s))).toBe("fatal");
  });
});

describe("callWithFallback", () => {
  it("recovers from a transient 503 by retrying the same model (the production failure)", async () => {
    const { calls, call } = scripted({ primary: [highDemand503(), "ok"] });
    const r = await callWithFallback(["primary", "fallback"], call, { sleep: noSleep });
    expect(r).toEqual({ value: "ok", model: "primary", attempts: 2 });
    expect(calls).toEqual(["primary", "primary"]);
  });

  it("falls back to the next model when the main model stays overloaded", async () => {
    const { calls, call } = scripted({ primary: [highDemand503(), highDemand503(), highDemand503()], fallback: ["ok"] });
    const r = await callWithFallback(["primary", "fallback"], call, { sleep: noSleep });
    expect(r.model).toBe("fallback");
    expect(calls).toEqual(["primary", "primary", "primary", "fallback"]);
  });

  it("does not retry or fall back on a bad request", async () => {
    const { calls, call } = scripted({ primary: [httpError(400)] });
    await expect(callWithFallback(["primary", "fallback"], call, { sleep: noSleep })).rejects.toMatchObject({ status: 400 });
    expect(calls).toEqual(["primary"]);
  });

  it("does not retry or fall back on an invalid key", async () => {
    const { calls, call } = scripted({ primary: [httpError(401)] });
    await expect(callWithFallback(["primary", "fallback"], call, { sleep: noSleep })).rejects.toMatchObject({ status: 401 });
    expect(calls).toEqual(["primary"]);
  });

  it("skips straight to the fallback for a retired model or exhausted quota", async () => {
    for (const status of [404, 429]) {
      const { calls, call } = scripted({ primary: [httpError(status)], fallback: ["ok"] });
      const r = await callWithFallback(["primary", "fallback"], call, { sleep: noSleep });
      expect(r.model).toBe("fallback");
      expect(calls).toEqual(["primary", "fallback"]);
    }
  });

  it("retries network failures without a status", async () => {
    const { call } = scripted({ primary: [new Error("fetch failed"), "ok"] });
    expect((await callWithFallback(["primary"], call, { sleep: noSleep })).value).toBe("ok");
  });

  it("reports exhaustion with the last error and model when everything is overloaded", async () => {
    const { call } = scripted({ primary: [highDemand503(), highDemand503(), highDemand503()], fallback: [highDemand503(), highDemand503(), highDemand503()] });
    const err = await callWithFallback(["primary", "fallback"], call, { sleep: noSleep }).catch((e) => e);
    expect(err).toBeInstanceOf(AiExhaustedError);
    expect(err.lastModel).toBe("fallback");
    expect(err.attempts).toBe(6);
    expect(err.status).toBe(503);
  });

  it("stops starting new attempts after the deadline", async () => {
    let t = 0;
    const { calls, call } = scripted({ primary: [highDemand503(), highDemand503(), highDemand503()], fallback: ["ok"] });
    const err = await callWithFallback(["primary", "fallback"], call, {
      deadlineMs: 5_000,
      now: () => t,
      sleep: async (ms) => { t += ms + 10_000; },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AiExhaustedError);
    expect(calls).toEqual(["primary"]);
  });

  it("uses exponential backoff between retries", async () => {
    const delays: number[] = [];
    const { call } = scripted({ primary: [highDemand503(), highDemand503(), "ok"] });
    await callWithFallback(["primary"], call, { sleep: async (ms) => { delays.push(ms); }, random: () => 0.5, baseDelayMs: 800 });
    expect(delays).toEqual([800, 1600]);
  });

  it("de-duplicates models and rejects an empty list", async () => {
    const { calls, call } = scripted({ a: ["ok"] });
    await callWithFallback(["a", "a"], call, { sleep: noSleep });
    expect(calls).toEqual(["a"]);
    await expect(callWithFallback([], call)).rejects.toThrow(/No AI model/);
  });
});

describe("user-facing message after the production failure", () => {
  it("an exhausted overload shows the 'busy' message, with technical detail only in the internal log text", () => {
    const err = geminiError(new AiExhaustedError(highDemand503(), "gemini-x", 6), "gemini-x");
    expect(err.message).toBe(USER_MESSAGES.busy);
    expect(err.message).not.toMatch(/gemini|503|demand/i);
    expect(err.internal).toMatch(/status 503.*gemini-x.*6 attempt/);
    expect((err.cause as Error).message).toMatch(/high demand/);
  });
  it("a direct 503 also maps to 'busy' rather than 'unavailable'", () => {
    expect(geminiError(highDemand503(), "m").message).toBe(USER_MESSAGES.busy);
  });
});

describe("parseModelList", () => {
  it("defaults, parses lists and supports 'none'", () => {
    expect(parseModelList(undefined, ["d"])).toEqual(["d"]);
    expect(parseModelList("a, b ,", ["d"])).toEqual(["a", "b"]);
    expect(parseModelList("none", ["d"])).toEqual([]);
  });
});

describe("prepareTileImage (EXIF orientation)", () => {
  it("crops tiles from a rotated phone JPEG using displayed coordinates", async () => {
    // Stored 400 wide × 900 tall, tagged orientation 6 → displayed 900 wide × 400 tall.
    const stored = await sharp({ create: { width: 400, height: 900, channels: 3, background: "#336699" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const displayedWidth = 900;
    const tile = await prepareTileImage(stored, { top: 200, height: 200 }, displayedWidth, false);
    const meta = await sharp(tile).metadata();
    expect(meta.width).toBe(900);
    expect(meta.height).toBe(200);
    // Without rotation this crop (900 wide) is outside the 400-wide stored image and fails.
    await expect(sharp(stored).extract({ left: 0, top: 200, width: 900, height: 200 }).png().toBuffer()).rejects.toThrow();
  });
});
