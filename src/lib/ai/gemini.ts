import "server-only";
import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import { getEnv } from "../config/env";
import { AppError, redact, USER_MESSAGES } from "../errors";
import { toGeminiRequest, type ChatMessage } from "./gemini-messages";
import { AiExhaustedError, callWithFallback, errorStatus } from "./resilience";

/**
 * Shared Google Gemini client, used for BOTH:
 *   - screenshot understanding (src/lib/vision/gemini.ts)
 *   - natural-language instruction interpretation and result summaries (text)
 *
 * SDK: @google/genai `models.generateContent` (verified in SDK 3.6.1 typings).
 * Default model: gemini-3.1-flash-lite (GEMINI_MODEL), with fallbacks
 * (GEMINI_FALLBACK_MODELS, default gemini-3.5-flash-lite).
 *
 * Every request goes through `generateResilient`: temporary provider errors are
 * retried with backoff and, if the model stays overloaded, the next model is used.
 * (The SDK itself does not retry unless retryOptions are passed.)
 */
let ai: GoogleGenAI | null = null;

export function getGemini(): { ai: GoogleGenAI; model: string; models: string[] } {
  const env = getEnv();
  if (!env.gemini.apiKey) {
    throw new AppError("SERVICE_NOT_CONFIGURED", USER_MESSAGES.analysisUnavailable, { internal: "GEMINI_API_KEY is not set" });
  }
  ai ??= new GoogleGenAI({ apiKey: env.gemini.apiKey });
  return { ai, model: env.gemini.model, models: [env.gemini.model, ...env.gemini.fallbackModels] };
}

/**
 * Map SDK/HTTP failures to a user-safe message (no provider, model or key
 * details) plus an internal explanation that only goes to server logs.
 */
export function geminiError(e: unknown, model: string): AppError {
  if (e instanceof AppError) return e;
  const exhausted = e instanceof AiExhaustedError ? e : null;
  const source = exhausted ? exhausted.lastError : e;
  const usedModel = exhausted ? exhausted.lastModel : model;
  const status = errorStatus(source);
  const temporary = status === undefined || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
  const user =
    status === 400 ? "This screenshot could not be processed. Try a clearer or smaller image."
    : temporary ? USER_MESSAGES.busy
    : USER_MESSAGES.analysisUnavailable;
  const internal =
    (status === 400 ? `Gemini rejected the request (400) for model ${usedModel}`
    : status === 401 || status === 403 ? `Gemini rejected the API key (${status}); check GEMINI_API_KEY`
    : status === 404 ? `Gemini model "${usedModel}" not found (404); check GEMINI_MODEL / GEMINI_FALLBACK_MODELS`
    : status === 429 ? `Gemini quota or rate limit exceeded (429) for model ${usedModel}`
    : `Gemini unavailable (status ${status ?? "none"}) for model ${usedModel}`) +
    (exhausted ? ` after ${exhausted.attempts} attempt(s) across all configured models` : "");
  return new AppError("UPSTREAM_ERROR", user, {
    internal,
    // Lets the job pipeline schedule an automatic retry for temporary overloads.
    details: { transient: temporary },
    cause: new Error(redact(String((source as Error)?.message ?? source))),
  });
}

/**
 * generateContent with retries and model fallback. `build` receives the model
 * to use so the same request can be sent to a fallback model.
 */
export async function generateResilient(
  label: string,
  build: (model: string) => Omit<GenerateContentParameters, "model">,
  limits: { timeoutMs: number; deadlineMs: number; attemptsPerModel?: number },
): Promise<{ res: GenerateContentResponse; model: string }> {
  const { ai, model, models } = getGemini();
  try {
    const { value, model: used } = await callWithFallback(
      models,
      (m) => {
        const params = build(m);
        return ai.models.generateContent({ ...params, model: m, config: { ...params.config, httpOptions: { timeout: limits.timeoutMs } } });
      },
      {
        deadlineMs: limits.deadlineMs,
        attemptsPerModel: limits.attemptsPerModel ?? 2,
        onFailure: ({ model: m, attempt, status, action, error }) =>
          console.warn(`[fenafilter] ai ${label}: ${m} attempt ${attempt} failed (status ${status ?? "none"}), ${action === "retry" ? "retrying" : action === "next-model" ? "trying next model" : "giving up"}: ${redact(String((error as Error)?.message ?? error)).slice(0, 160)}`),
      },
    );
    if (used !== model) console.warn(`[fenafilter] ai ${label}: served by fallback model ${used}`);
    return { res: value, model: used };
  } catch (e) {
    throw geminiError(e, model);
  }
}

/**
 * Text chat with Gemini. `json: true` asks for application/json output; the
 * caller still extracts and schema-validates the result (never trusted).
 */
export async function geminiChat(
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number; temperature?: number; quick?: boolean } = {},
): Promise<string> {
  const { systemInstruction, contents } = toGeminiRequest(messages);
  const { res } = await generateResilient(
    "text",
    () => ({
      contents,
      config: {
        systemInstruction,
        temperature: opts.temperature ?? 0.1,
        maxOutputTokens: opts.maxTokens ?? 4000,
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
    }),
    // "quick" requests (optional extras such as summaries) must never hold up results.
    opts.quick ? { timeoutMs: 15_000, deadlineMs: 20_000, attemptsPerModel: 1 } : { timeoutMs: 45_000, deadlineMs: 90_000 },
  );
  const text = res.text;
  if (!text) throw new AppError("AI_INVALID_RESPONSE", "The analysis returned no result. Please try again.", { internal: "Gemini returned an empty response" });
  return text;
}

/**
 * Real connection check used by the protected diagnostics endpoint:
 * one tiny generation request to the main model and each fallback model.
 */
export async function verifyGeminiConnection(): Promise<{ ok: boolean; model: string; message: string; latencyMs?: number; models: { model: string; ok: boolean; message: string }[] }> {
  const env = getEnv();
  const results: { model: string; ok: boolean; message: string }[] = [];
  let latencyMs: number | undefined;
  for (const model of [env.gemini.model, ...env.gemini.fallbackModels]) {
    try {
      const { ai } = getGemini();
      const started = Date.now();
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
        config: { temperature: 0, maxOutputTokens: 10, httpOptions: { timeout: 20_000 } },
      });
      if (model === env.gemini.model) latencyMs = Date.now() - started;
      const reply = (res.text ?? "").trim();
      results.push({ model, ok: Boolean(reply), message: reply ? "responded" : "empty reply" });
    } catch (e) {
      const err = geminiError(e, model);
      results.push({ model, ok: false, message: err.internal ?? err.message });
    }
  }
  const primary = results[0]!;
  const anyOk = results.some((r) => r.ok);
  return {
    ok: anyOk,
    model: primary.model,
    message: primary.ok ? "Main model responded." : anyOk ? "Main model failed; analyses will use a fallback model." : "No configured model responded.",
    latencyMs,
    models: results,
  };
}
