import { createHash, timingSafeEqual } from "node:crypto";
import { verifyGeminiConnection } from "@/lib/ai/gemini";
import { getEnv, getServiceStatus } from "@/lib/config/env";
import { errorResponse, json } from "@/lib/http";

/**
 * GET /api/health
 *   Public liveness check for uptime monitors: { "status": "ok" }.
 *   Reveals nothing about providers, models, storage or configuration.
 *
 * GET /api/health?details=1                 (developer diagnostics)
 * GET /api/health?details=1&verify=gemini   (also sends one real AI request)
 *   Production: requires  Authorization: Bearer <DIAGNOSTICS_SECRET>.
 *   If DIAGNOSTICS_SECRET is not set, diagnostics are disabled in production.
 *   Local development (NODE_ENV !== "production"): allowed without a secret.
 *   Unauthorised requests get the same 404 as an unknown route.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const wantsDetails = url.searchParams.has("details") || url.searchParams.has("verify");
    if (!wantsDetails) return json({ status: "ok" });

    if (!diagnosticsAllowed(req)) {
      return json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
    }

    const env = getEnv();
    const services = getServiceStatus();
    const verify = url.searchParams.get("verify");
    const aiCheck =
      verify === "gemini"
        ? services.gemini.configured
          ? await verifyGeminiConnection()
          : { ok: false, model: services.gemini.model, message: "GEMINI_API_KEY is not set." }
        : null;
    return json(
      {
        status: aiCheck && !aiCheck.ok ? "degraded" : "ok",
        services,
        aiCheck,
        warnings: env.sessionSecretIsDevFallback ? ["SESSION_SECRET is not set; using a temporary random secret."] : [],
      },
      { status: aiCheck && !aiCheck.ok ? 503 : 200 },
    );
  } catch (e) {
    return errorResponse(e, "health");
  }
}

function diagnosticsAllowed(req: Request): boolean {
  const env = getEnv();
  const secret = env.diagnosticsSecret;
  if (secret) {
    const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    // Compare fixed-length digests so the check is constant-time regardless of input length.
    const a = createHash("sha256").update(given).digest();
    const b = createHash("sha256").update(secret).digest();
    return given.length > 0 && timingSafeEqual(a, b);
  }
  return !env.isProduction && !env.isVercel;
}
