import { AppError } from "@/lib/errors";
import { clientIp, errorResponse, json } from "@/lib/http";
import { requireJob } from "@/lib/jobs/repository";
import { toJobView } from "@/lib/jobs/view";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { requireSessionId } from "@/lib/security/session";

/** GET /api/results/[id] — the full analysis report for a completed job. */
export async function GET(req: Request, ctx: RouteContext<"/api/results/[id]">) {
  try {
    const { id } = await ctx.params;
    const ownerId = await requireSessionId();
    checkRateLimit("read", `${ownerId}:${clientIp(req)}`);
    const job = await requireJob(ownerId, id);
    if (job.status !== "COMPLETED") throw new AppError("CONFLICT", "This analysis has not finished yet.");
    return json(toJobView(job));
  } catch (e) {
    return errorResponse(e, "results");
  }
}
