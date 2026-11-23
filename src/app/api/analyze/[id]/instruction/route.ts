import { after } from "next/server";
import { z } from "zod";
import { interpretInstruction } from "@/lib/ai/interpret";
import { AppError } from "@/lib/errors";
import { clientIp, errorResponse, json, readJson } from "@/lib/http";
import { advance, continueOrAsk } from "@/lib/jobs/pipeline";
import { requireJob, saveJob, setStep } from "@/lib/jobs/repository";
import { toJobView } from "@/lib/jobs/view";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { sanitizeInstruction } from "@/lib/security/sanitize";
import { requireSessionId } from "@/lib/security/session";

export const maxDuration = 300;

const Body = z.object({
  instruction: z.string().min(3).max(1500),
  /**
   * true (default flow): once the instruction is understood, the analysis runs
   * to completion automatically. false: stop for review (advanced editor).
   */
  autoContinue: z.boolean().optional(),
});

/**
 * POST /api/analyze/[id]/instruction — (re)interpret an instruction.
 * Used to answer a clarification question or to change the instruction later.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/analyze/[id]/instruction">) {
  try {
    const { id } = await ctx.params;
    const ownerId = await requireSessionId();
    checkRateLimit("confirm", `${ownerId}:${clientIp(req)}`);
    const { instruction, autoContinue } = await readJson(req, Body);
    let job = await requireJob(ownerId, id);
    if (!["AWAITING_CONFIRMATION", "COMPLETED", "FAILED"].includes(job.status) || !job.extraction) {
      throw new AppError("CONFLICT", "Please wait until the matches have been read.");
    }
    const clean = sanitizeInstruction(instruction);
    const result = await interpretInstruction(clean);
    job = { ...job, instruction: clean, plan: result.plan, planError: result.error, status: "AWAITING_CONFIRMATION", error: null };

    if (autoContinue ?? true) {
      // Same rule as the pipeline: continue unless the instruction still needs an answer.
      job = continueOrAsk({ ...job, decisions: null, output: null, summary: null, retry: null, lease: null });
      for (const s of ["evaluate", "image"] as const) job = setStep(job, s, "pending");
    } else {
      job = setStep(
        job,
        "interpret",
        result.plan ? (result.plan.status === "ok" ? "done" : "waiting") : "failed",
        result.plan ? (result.plan.status === "ok" ? result.plan.summary.slice(0, 160) : "A quick question about your instruction") : result.error,
      );
    }
    job = await saveJob(job);
    if (job.status === "FETCHING_STATISTICS") after(() => advance(ownerId, id));
    return json(toJobView(job));
  } catch (e) {
    return errorResponse(e, "instruction");
  }
}
