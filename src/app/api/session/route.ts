import { getPublicAvailability } from "@/lib/config/env";
import { errorResponse, json } from "@/lib/http";
import { getOrCreateSessionId } from "@/lib/security/session";

/**
 * Creates the guest session cookie and tells the browser which upload flow to
 * use and whether analysis is available. Deliberately names no providers,
 * models or storage systems.
 */
export async function GET() {
  try {
    const ownerId = await getOrCreateSessionId();
    return json({ ownerId, ...getPublicAvailability() });
  } catch (e) {
    return errorResponse(e, "session");
  }
}
