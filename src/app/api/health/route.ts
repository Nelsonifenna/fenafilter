import { verifyGeminiConnection } from "@/lib/ai/gemini";
import { getEnv, getServiceStatus } from "@/lib/config/env";
import { errorResponse, json } from "@/lib/http";

/**
 * GET /api/health — which integrations are configured (never returns secrets).
 * GET /api/health?verify=gemini — performs a REAL Gemini check: looks up the
 * configured model in Google's live catalogue and sends one tiny text request.
 */
export async function GET(req: Request) {
  try {
    const status = getServiceStatus();
    const verify = new URL(req.url).searchParams.get("verify");
    let geminiCheck: Awaited<ReturnType<typeof verifyGeminiConnection>> | { ok: false; model: string; message: string } | null = null;
    if (verify === "gemini") {
      geminiCheck = status.gemini.configured
        ? await verifyGeminiConnection()
        : { ok: false, model: status.gemini.model, message: "GEMINI_API_KEY is not set." };
    }
    return json(
      {
        ok: geminiCheck ? geminiCheck.ok : true,
        services: status,
        geminiCheck,
        warnings: getEnv().sessionSecretIsDevFallback ? ["SESSION_SECRET is not set; using a temporary random secret (sessions reset when the server restarts)."] : [],
      },
      { status: geminiCheck && !geminiCheck.ok ? 503 : 200 },
    );
  } catch (e) {
    return errorResponse(e, "health");
  }
}
