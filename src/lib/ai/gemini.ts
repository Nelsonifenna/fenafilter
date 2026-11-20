import "server-only";
import { GoogleGenAI } from "@google/genai";
import { getEnv } from "../config/env";
import { AppError, redact } from "../errors";
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
    throw new AppError("SERVICE_NOT_CONFIGURED", "Google Gemini is not configured. Add GEMINI_API_KEY.");
  }
  ai ??= new GoogleGenAI({ apiKey: env.gemini.apiKey });
  return { ai, model: env.gemini.model };
}

/** Map SDK/HTTP failures to user-safe messages. Never includes the key. */
export function geminiError(e: unknown, model: string): AppError {
  if (e instanceof AppError) return e;
  const status = (e as { status?: number }).status;
  const msg =
    status === 400 ? "Gemini rejected the request (400). The input may be unsupported."
    : status === 401 || status === 403 ? "Gemini rejected the API key. Check GEMINI_API_KEY."
    : status === 404 ? `Gemini model "${model}" was not found. Check GEMINI_MODEL against Google's model list.`
    : status === 429 ? "Gemini quota or rate limit exceeded (429). Free-tier limits may apply; please retry later."
    : "Google Gemini is unavailable right now.";
  return new AppError("UPSTREAM_ERROR", msg, { cause: new Error(redact(String((e as Error)?.message ?? e))) });
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
  if (!text) throw new AppError("AI_INVALID_RESPONSE", "Gemini returned an empty response.");
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
    return { ok: false, model, message: geminiError(e, model).message };
  }
}
