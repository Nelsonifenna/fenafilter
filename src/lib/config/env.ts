import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Centralised, validated server-side configuration.
 *
 * Every secret is read ONLY here, on the server. Nothing in this file is ever
 * imported by a client component ("server-only" makes the build fail if it is).
 *
 * Missing API keys are allowed: the matching feature reports itself as
 * "not configured" instead of crashing the whole application.
 */

// Treat empty strings ("KEY=") the same as an unset variable.
const optionalString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().min(1).optional(),
);

const boolString = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.enum(["true", "false", "1", "0"]).optional(),
);

const schema = z.object({
  GEMINI_API_KEY: optionalString,
  // Default gemini-3.1-flash-lite: listed by Google as supporting text + image
  // input with free-tier access. Override with GEMINI_MODEL.
  GEMINI_MODEL: optionalString,

  API_FOOTBALL_KEY: optionalString,
  API_FOOTBALL_BASE_URL: optionalString,
  API_FOOTBALL_ENABLE_PREDICTIONS: boolString,

  BLOB_READ_WRITE_TOKEN: optionalString,

  SESSION_SECRET: optionalString,
  CRON_SECRET: optionalString,
  LOCAL_STORAGE_DIR: optionalString,
});

export type ServerEnv = {
  gemini: { apiKey?: string; model: string };
  football: { apiKey?: string; baseUrl: string; enablePredictions: boolean };
  blob: { token?: string };
  sessionSecret: string;
  sessionSecretIsDevFallback: boolean;
  cronSecret?: string;
  localStorageDir: string;
  isProduction: boolean;
  isVercel: boolean;
};

export const SESSION_SECRET_MIN_LENGTH = 32;
export const MISSING_SESSION_SECRET_MESSAGE =
  "SESSION_SECRET is required in production. Set it to a random value of at least 32 characters " +
  "(see README: \"Generating SESSION_SECRET\"). FenaFilter refuses to start without it.";

/**
 * Decide which secret signs session cookies. Pure function (unit-tested).
 *
 * - SESSION_SECRET set           → used (must be ≥ 32 chars).
 * - Missing in production/Vercel → throws: the app must not run with a guessable secret.
 * - Missing during `next build`  → random throwaway secret (the build serves no users).
 * - Missing in development       → random per-process secret (sessions reset on restart).
 *
 * There is no hard-coded fallback secret anywhere in the code base.
 * Error messages never contain the secret value.
 */
export function resolveSessionSecret(input: {
  secret: string | undefined;
  nodeEnv: string | undefined;
  isVercel: boolean;
  nextPhase: string | undefined;
  random: () => string;
}): { secret: string; isEphemeral: boolean } {
  const { secret, nodeEnv, isVercel, nextPhase, random } = input;
  if (secret) {
    if (secret.length < SESSION_SECRET_MIN_LENGTH) {
      throw new Error(`SESSION_SECRET must be at least ${SESSION_SECRET_MIN_LENGTH} characters long.`);
    }
    return { secret, isEphemeral: false };
  }
  const isBuild = nextPhase === "phase-production-build";
  if ((nodeEnv === "production" || isVercel) && !isBuild) {
    throw new Error(MISSING_SESSION_SECRET_MESSAGE);
  }
  return { secret: random(), isEphemeral: true };
}

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Never print values, only which variables are invalid.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${names}`);
  }
  const e = parsed.data;
  const isProduction = process.env.NODE_ENV === "production";
  const isVercel = Boolean(process.env.VERCEL);

  const session = resolveSessionSecret({
    secret: e.SESSION_SECRET,
    nodeEnv: process.env.NODE_ENV,
    isVercel,
    nextPhase: process.env.NEXT_PHASE,
    random: () => randomBytes(32).toString("hex"),
  });

  cached = {
    gemini: { apiKey: e.GEMINI_API_KEY, model: e.GEMINI_MODEL ?? "gemini-3.1-flash-lite" },
    football: {
      apiKey: e.API_FOOTBALL_KEY,
      baseUrl: e.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io",
      enablePredictions: e.API_FOOTBALL_ENABLE_PREDICTIONS === "true" || e.API_FOOTBALL_ENABLE_PREDICTIONS === "1",
    },
    blob: { token: e.BLOB_READ_WRITE_TOKEN },
    sessionSecret: session.secret,
    sessionSecretIsDevFallback: session.isEphemeral,
    cronSecret: e.CRON_SECRET,
    localStorageDir: e.LOCAL_STORAGE_DIR ?? ".data",
    isProduction,
    isVercel,
  };
  return cached;
}

/** Which integrations are usable right now. Safe to send to the browser (no secrets). */
export function getServiceStatus() {
  const env = getEnv();
  return {
    gemini: { configured: Boolean(env.gemini.apiKey), model: env.gemini.model },
    football: { configured: Boolean(env.football.apiKey), predictions: env.football.enablePredictions },
    storage: { mode: env.blob.token ? ("vercel-blob" as const) : ("local" as const) },
  };
}

export type ServiceStatus = ReturnType<typeof getServiceStatus>;

/** For tests only. */
export function __resetEnvCache() {
  cached = null;
}
