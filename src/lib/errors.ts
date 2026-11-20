/**
 * Typed application errors. `expose` controls whether the message is safe to
 * show to the user; anything else is replaced with a generic message so that
 * internal details (stack traces, provider responses) never leak.
 */
export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA"
  | "SERVICE_NOT_CONFIGURED"
  | "UPSTREAM_ERROR"
  | "AI_INVALID_RESPONSE"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  SERVICE_NOT_CONFIGURED: 503,
  UPSTREAM_ERROR: 502,
  AI_INVALID_RESPONSE: 502,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly expose: boolean;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, opts: { expose?: boolean; details?: unknown; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.expose = opts.expose ?? true;
    this.details = opts.details;
  }
}

export function toPublicError(err: unknown): { code: ErrorCode; message: string; status: number } {
  if (err instanceof AppError) {
    return {
      code: err.code,
      status: err.status,
      message: err.expose ? err.message : "Something went wrong while processing your request.",
    };
  }
  return { code: "INTERNAL", status: 500, message: "Something went wrong while processing your request." };
}

/** Log without leaking secrets: only the message and code, never request bodies or keys. */
export function logError(context: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err instanceof AppError ? err.code : "INTERNAL";
  console.error(`[fenafilter] ${context}: ${code} ${redact(msg)}`);
}

/** Remove anything that looks like a credential from a string before logging it. */
export function redact(text: string): string {
  return text
    .replace(/(key|token|secret|authorization|bearer)([=:\s"']+)[A-Za-z0-9._\-]{8,}/gi, "$1$2[redacted]")
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[redacted]")
    .replace(/vercel_blob_rw_[A-Za-z0-9_]+/g, "[redacted]");
}
