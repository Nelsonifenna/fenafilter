/**
 * Retry + model-fallback policy for AI requests (pure, unit-tested).
 *
 * Root cause this addresses (Nov 2026): the provider returned
 *   503 UNAVAILABLE "This model is currently experiencing high demand"
 * for the configured model, for minutes at a time. The SDK only retries when
 * `retryOptions` is passed, so a single 503 failed the whole analysis.
 *
 * Policy per error:
 *  - 500/502/503/504, network errors, timeouts → retry the same model with backoff,
 *    then move on to the next model.
 *  - 404 (model retired) or 429 (quota for this model) → next model immediately.
 *  - 400/401/403 and anything else → fail immediately (retrying cannot help).
 */

export type FailureAction = "retry" | "next-model" | "fatal";

export function errorStatus(e: unknown): number | undefined {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}

export function classifyAiError(e: unknown): FailureAction {
  const s = errorStatus(e);
  if (s === undefined) return "retry"; // network failure, DNS, timeout/abort
  if (s === 500 || s === 502 || s === 503 || s === 504) return "retry";
  if (s === 404 || s === 429) return "next-model";
  return "fatal";
}

export interface FallbackOptions {
  attemptsPerModel?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Stop starting new attempts after this long (keeps work inside the serverless time budget). */
  deadlineMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  onFailure?: (info: { model: string; attempt: number; status: number | undefined; action: FailureAction; error: unknown }) => void;
}

/** Thrown when every model and attempt failed; keeps the last provider error and model. */
export class AiExhaustedError extends Error {
  constructor(
    readonly lastError: unknown,
    readonly lastModel: string,
    readonly attempts: number,
  ) {
    super(`All AI attempts failed after ${attempts} tries (last model ${lastModel})`);
    this.name = "AiExhaustedError";
  }
  get status() {
    return errorStatus(this.lastError);
  }
}

export async function callWithFallback<T>(
  models: string[],
  call: (model: string, attempt: number) => Promise<T>,
  opts: FallbackOptions = {},
): Promise<{ value: T; model: string; attempts: number }> {
  const attemptsPerModel = opts.attemptsPerModel ?? 3;
  const base = opts.baseDelayMs ?? 800;
  const max = opts.maxDelayMs ?? 4000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  const started = now();
  const unique = [...new Set(models.filter(Boolean))];
  if (unique.length === 0) throw new Error("No AI model configured");

  let total = 0;
  let lastError: unknown = null;
  let lastModel = unique[0]!;

  for (const model of unique) {
    for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
      if (opts.deadlineMs !== undefined && total > 0 && now() - started >= opts.deadlineMs) {
        throw new AiExhaustedError(lastError, lastModel, total);
      }
      total++;
      lastModel = model;
      try {
        return { value: await call(model, attempt), model, attempts: total };
      } catch (e) {
        lastError = e;
        const action = classifyAiError(e);
        opts.onFailure?.({ model, attempt, status: errorStatus(e), action, error: e });
        if (action === "fatal") throw e;
        if (action === "next-model") break;
        if (attempt < attemptsPerModel) {
          // Exponential backoff with jitter: ~0.8s, ~1.6s, … capped.
          const delay = Math.min(max, base * 2 ** (attempt - 1)) * (0.75 + random() * 0.5);
          await sleep(Math.round(delay));
        }
      }
    }
  }
  throw new AiExhaustedError(lastError, lastModel, total);
}

/** Parse a comma-separated fallback list; "none" disables fallbacks. */
export function parseModelList(value: string | undefined, fallbackDefault: string[]): string[] {
  if (value === undefined) return fallbackDefault;
  const v = value.trim();
  if (v.toLowerCase() === "none") return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}
