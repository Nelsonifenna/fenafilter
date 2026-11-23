import { after } from "next/server";
import { z } from "zod";
import type { Job } from "@/lib/domain/schemas";
import { AppError, USER_MESSAGES } from "@/lib/errors";
import { clientIp, errorResponse, json, readJson } from "@/lib/http";
import { advance } from "@/lib/jobs/pipeline";
import { initialSteps, JOB_TTL_HOURS, newJobId, saveJob } from "@/lib/jobs/repository";
import { getServiceStatus } from "@/lib/config/env";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { sanitizeExtractedText, sanitizeInstruction } from "@/lib/security/sanitize";
import { requireSessionId } from "@/lib/security/session";
import { getStore } from "@/lib/storage";
import { inspectImage, uploadPathRegex } from "@/lib/uploads";

export const maxDuration = 300;

const Body = z.object({
  imageKey: z.string().min(1).max(300),
  instruction: z.string().min(3, "Please enter an instruction.").max(1500),
  originalName: z.string().max(200).optional(),
});

/** POST /api/analyze — create an analysis job and start extraction in the background. */
export async function POST(req: Request) {
  try {
    const ownerId = await requireSessionId();
    checkRateLimit("analyze", `${ownerId}:${clientIp(req)}`);
    const body = await readJson(req, Body);

    // Blob client uploads add a random suffix before the extension; both forms match this regex.
    if (!uploadPathRegex(ownerId).test(body.imageKey)) throw new AppError("FORBIDDEN", "This image does not belong to your session.");
    if (!getServiceStatus().gemini.configured) {
      throw new AppError("SERVICE_NOT_CONFIGURED", USER_MESSAGES.analysisUnavailable, { internal: "GEMINI_API_KEY is not set" });
    }

    const stored = await getStore().get(body.imageKey);
    if (!stored) throw new AppError("NOT_FOUND", "The uploaded image was not found. Please upload it again.");
    const info = await inspectImage(stored.body); // re-validate the actual bytes server-side

    const now = new Date();
    const job: Job = {
      id: newJobId(),
      ownerId,
      version: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + JOB_TTL_HOURS * 3600_000).toISOString(),
      status: "EXTRACTING",
      error: null,
      image: { key: body.imageKey, ...info, originalName: sanitizeExtractedText(body.originalName ?? "screenshot", 120) },
      instruction: sanitizeInstruction(body.instruction),
      steps: initialSteps(),
      extraction: null,
      plan: null,
      planError: null,
      fixturesConfirmed: false,
      stats: {},
      decisions: null,
      summary: null,
      output: null,
      lease: null,
    };
    await saveJob(job);
    after(() => advance(ownerId, job.id));
    return json({ id: job.id }, { status: 202 });
  } catch (e) {
    return errorResponse(e, "analyze");
  }
}
