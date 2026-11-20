import { errorResponse, json } from "@/lib/http";
import { deleteJob, requireJob } from "@/lib/jobs/repository";
import { requireSessionId } from "@/lib/security/session";

/** DELETE /api/history/[id] — delete an analysis and its stored images. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/history/[id]">) {
  try {
    const { id } = await ctx.params;
    const ownerId = await requireSessionId();
    const job = await requireJob(ownerId, id);
    await deleteJob(ownerId, job);
    return json({ deleted: true });
  } catch (e) {
    return errorResponse(e, "history-delete");
  }
}
