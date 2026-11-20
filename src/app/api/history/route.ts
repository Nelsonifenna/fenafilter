import { errorResponse, json } from "@/lib/http";
import { listJobs } from "@/lib/jobs/repository";
import { toJobSummary } from "@/lib/jobs/view";
import { getSessionId } from "@/lib/security/session";

/** GET /api/history — analyses belonging to the current session. */
export async function GET() {
  try {
    const ownerId = await getSessionId();
    if (!ownerId) return json({ items: [] });
    const jobs = await listJobs(ownerId);
    return json({ items: jobs.map(toJobSummary) });
  } catch (e) {
    return errorResponse(e, "history");
  }
}
