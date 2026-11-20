import { AppError } from "../errors";

/**
 * Fixed-window, in-memory rate limiter.
 *
 * Limitation (documented in README): on serverless platforms each instance
 * has its own memory, so limits are per-instance. That still blocks naive
 * abuse; for strict global limits swap this for a shared store (e.g. Upstash
 * Redis) behind the same `checkRateLimit` signature.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export const LIMITS = {
  upload: { max: 20, windowMs: 10 * 60_000 },
  analyze: { max: 10, windowMs: 10 * 60_000 },
  confirm: { max: 20, windowMs: 10 * 60_000 },
  process: { max: 30, windowMs: 10 * 60_000 },
  read: { max: 600, windowMs: 10 * 60_000 },
} as const;

export function checkRateLimit(kind: keyof typeof LIMITS, identity: string, now = Date.now()) {
  const { max, windowMs } = LIMITS[kind];
  const key = `${kind}:${identity}`;
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    sweep(now);
    return;
  }
  if (b.count >= max) {
    const retryAfter = Math.ceil((b.resetAt - now) / 1000);
    throw new AppError("RATE_LIMITED", `Too many requests. Please wait ${retryAfter}s and try again.`, {
      details: retryAfter,
    });
  }
  b.count += 1;
}

function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export function __resetRateLimits() {
  buckets.clear();
}
