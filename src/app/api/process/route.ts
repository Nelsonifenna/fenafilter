import { z } from "zod";
import { DecisionValueSchema } from "@/lib/domain/schemas";
import { AppError } from "@/lib/errors";
import { clientIp, errorResponse, json, readJson } from "@/lib/http";
import { renderOutput } from "@/lib/jobs/pipeline";
import { requireJob, saveJob } from "@/lib/jobs/repository";
import { toJobView } from "@/lib/jobs/view";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { requireSessionId } from "@/lib/security/session";

export const maxDuration = 60;

const Body = z.object({
  jobId: z.string().regex(/^[a-f0-9]{24}$/),
  /** The user's final decisions, e.g. after reviewing NEEDS_REVIEW fixtures. */
  decisions: z.record(z.string().regex(/^match_\d{3}$/), DecisionValueSchema).default({}),
});

/** POST /api/process — apply confirmed decisions and regenerate the edited screenshot. */
export async function POST(req: Request) {
  try {
    const ownerId = await requireSessionId();
    checkRateLimit("process", `${ownerId}:${clientIp(req)}`);
    const body = await readJson(req, Body);
    let job = await requireJob(ownerId, body.jobId);
    if (job.status !== "COMPLETED" || !job.decisions) throw new AppError("CONFLICT", "The analysis is not finished yet.");

    const decisions = job.decisions.map((d) => {
      const chosen = body.decisions[d.fixtureId];
      if (!chosen) return d;
      return { ...d, decision: chosen, overridden: chosen !== d.engineDecision };
    });
    job = await renderOutput({ ...job, decisions });
    job = await saveJob(job);
    return json(toJobView(job));
  } catch (e) {
    return errorResponse(e, "process");
  }
}
