import { getServiceStatus } from "@/lib/config/env";
import { errorResponse, json } from "@/lib/http";
import { getOrCreateSessionId } from "@/lib/security/session";

/** Creates the guest session cookie and reports which services are configured (no secrets). */
export async function GET() {
  try {
    const ownerId = await getOrCreateSessionId();
    return json({ ownerId, services: getServiceStatus() });
  } catch (e) {
    return errorResponse(e, "session");
  }
}
