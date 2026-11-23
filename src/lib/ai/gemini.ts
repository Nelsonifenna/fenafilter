import "server-only";
import { GoogleGenAI } from "@google/genai";
import { getEnv } from "../config/env";
import { AppError, redact, USER_MESSAGES } from "../errors";
import { toGeminiRequest, type ChatMessage } from "./gemini-messages";

/**
 * Shared Google Gemini client, used for BOTH:
 *   - screenshot understanding (src/lib/vision/gemini.ts)
 *   - natural-language instruction interpretation and result summaries (text)
 *
 * SDK: @google/genai `models.generateContent` (verified in SDK 3.6.1 typings).
 * Default model: gemini-3.1-flash-lite (override with GEMINI_MODEL).
 */
let ai: GoogleGenAI | null = null;

export function getGemini(): { ai: GoogleGenAI; model: string } {
  const env = getEnv();
  if (!env.gemini.apiKey) {
    throw new AppError("SERVICE_NOT_CONFIGURED", USER_MESSAGES.analysisUnavailable, { internal: "GEMINI_API_KEY is not set" });
  }
  ai ??= new GoogleGenAI({ apiKey: env.gemini.apiKey });
  return { ai, model: env.gemini.model };
}

/**
 * Map SDK/HTTP failures to a user-safe message (no provider, model or key
 * details) plus an internal explanation that only goes to server logs.
 */
export function geminiError(e: unknown, model: string): AppError {
  if (e instanceof AppError) return e;
  const status = (e as { status?: number }).status;
  const user =
    status === 400 ? "This screenshot could not be processed. Try a clearer or smaller image."
    : status === 429 ? USER_MESSAGES.busy
    : USER_MESSAGES.analysisUnavailable;
  const internal =
    status === 400 ? `Gemini rejected the request (400) for model ${model}`
    : status === 401 || status === 403 ? `Gemini rejected the API key (${status}); check GEMINI_API_KEY`
    : status === 404 ? `Gemini model "${model}" not found (404); check GEMINI_MODEL`
    : status === 429 ? `Gemini quota or rate limit exceeded (429) for model ${model}`
    : `Gemini unavailable (status ${status ?? "none"}) for model ${model}`;
  return new AppError("UPSTREAM_ERROR", user, { internal, cause: new Error(redact(String((e as Error)?.message ?? e))) });
}

/**
 * Text chat with Gemini. `json: true` asks for application/json output; the
 * caller still extracts and schema-validates the result (never trusted).
 */
export async function geminiChat(
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const { ai, model } = getGemini();
  const { systemInstruction, contents } = toGeminiRequest(messages);
  let text: string | undefined;
  try {
    const res = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: opts.temperature ?? 0.1,
        maxOutputTokens: opts.maxTokens ?? 4000,
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
    });
    text = res.text;
  } catch (e) {
    throw geminiError(e, model);
  }
  if (!text) throw new AppError("AI_INVALID_RESPONSE", "The analysis returned no result. Please try again.", { internal: "Gemini returned an empty response" });
  return text;
}

/**
 * Real connection check used by GET /api/health?verify=gemini:
 * 1. the configured model exists in Google's live catalogue, and
 * 2. a minimal generation request succeeds with the configured key.
 */
export async function verifyGeminiConnection(): Promise<{ ok: boolean; model: string; message: string; latencyMs?: number }> {
  const model = getEnv().gemini.model;
  try {
    const { ai } = getGemini();
    const info = await ai.models.get({ model });
    const started = Date.now();
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
      config: { temperature: 0, maxOutputTokens: 10 },
    });
    const latencyMs = Date.now() - started;
    const reply = (res.text ?? "").trim();
    if (!reply) return { ok: false, model, message: "Connected, but the model returned an empty reply.", latencyMs };
    return { ok: true, model: info.name ?? model, message: `Gemini responded successfully (${reply.slice(0, 20)}).`, latencyMs };
  } catch (e) {
    // Developer diagnostics only (protected endpoint): show the technical reason.
    const err = geminiError(e, model);
    return { ok: false, model, message: err.internal ?? err.message };
  }
}
