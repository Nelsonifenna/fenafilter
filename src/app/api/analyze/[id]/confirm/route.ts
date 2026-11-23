import { after } from "next/server";
import { z } from "zod";
import { FixtureSchema } from "@/lib/domain/schemas";
import { AppError } from "@/lib/errors";
import { validatePlan } from "@/lib/filtering/plan-validation";
import { clientIp, errorResponse, json, readJson } from "@/lib/http";
import { advance } from "@/lib/jobs/pipeline";
import { requireJob, saveJob, setStep } from "@/lib/jobs/repository";
import { toJobView } from "@/lib/jobs/view";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { sanitizeExtractedText } from "@/lib/security/sanitize";
import { requireSessionId } from "@/lib/security/session";

export const maxDuration = 300;

const Body = z.object({
  fixtures: z.array(FixtureSchema).min(1).max(150),
  plan: z.unknown(),
});

/**
 * POST /api/analyze/[id]/confirm
 * The user has reviewed (and possibly corrected) the extracted fixtures and the
 * interpreted rules. Only now are statistics fetched and fixtures evaluated —
 * nothing is analysed on the basis of an unconfirmed extraction.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/analyze/[id]/confirm">) {
  try {
    const { id } = await ctx.params;
    const ownerId = await requireSessionId();
    checkRateLimit("confirm", `${ownerId}:${clientIp(req)}`);
    const body = await readJson(req, Body, 600_000);
    let job = await requireJob(ownerId, id);

    if (!["AWAITING_CONFIRMATION", "COMPLETED", "FAILED"].includes(job.status) || !job.extraction) {
      throw new AppError("CONFLICT", "This analysis cannot be confirmed in its current state.");
    }
    const v = validatePlan(body.plan);
    if (!v.ok || !v.plan) {
      throw new AppError("BAD_REQUEST", "These rules could not be applied. Adjust the thresholds or rephrase your instruction.", { internal: v.problems.join(" ") });
    }
    if (v.plan.status !== "ok") throw new AppError("BAD_REQUEST", "Please answer the clarification question first.");

    const { imageWidth: W, imageHeight: H } = job.extraction;
    const ids = new Set<string>();
    const previous = new Map(job.extraction.fixtures.map((f) => [f.id, f]));
    const fixtures = body.fixtures.map((f) => {
      if (ids.has(f.id)) throw new AppError("BAD_REQUEST", `Duplicate fixture id ${f.id}.`);
      ids.add(f.id);
      const homeTeam = sanitizeExtractedText(f.homeTeam);
      const awayTeam = sanitizeExtractedText(f.awayTeam);
      // Rows without readable names are allowed: they are evaluated as REVIEW and stay in the image.
      const x = Math.min(Math.max(0, f.box.x), W - 1);
      const y = Math.min(Math.max(0, f.box.y), H - 1);
      const prev = previous.get(f.id);
      const changed = !prev || prev.homeTeam !== homeTeam || prev.awayTeam !== awayTeam || prev.competition !== f.competition || JSON.stringify(prev.teamIds) !== JSON.stringify(f.teamIds) || JSON.stringify(prev.box) !== JSON.stringify(f.box);
      return {
        ...f,
        homeTeam,
        awayTeam,
        competition: f.competition ? sanitizeExtractedText(f.competition) || null : null,
        box: { x, y, width: Math.max(1, Math.min(f.box.width, W - x)), height: Math.max(1, Math.min(f.box.height, H - y)) },
        userEdited: f.userEdited || changed,
      };
    });

    // Drop cached stats for fixtures whose teams changed.
    const stats = { ...job.stats };
    for (const f of fixtures) {
      const prev = previous.get(f.id);
      if (!prev || prev.homeTeam !== f.homeTeam || prev.awayTeam !== f.awayTeam || prev.competition !== f.competition || JSON.stringify(prev.teamIds) !== JSON.stringify(f.teamIds)) delete stats[f.id];
    }
    for (const k of Object.keys(stats)) if (!ids.has(k)) delete stats[k];

    job = {
      ...job,
      extraction: { ...job.extraction, fixtures },
      plan: v.plan,
      planError: null,
      fixturesConfirmed: true,
      stats,
      decisions: null,
      summary: null,
      output: null,
      error: null,
      status: "FETCHING_STATISTICS",
      // A re-run checks previously failed fixtures again.
      statsUnavailable: [],
      notices: [],
      retry: null,
      lease: null,
    };
    job = setStep(job, "interpret", "done", v.plan.summary.slice(0, 160));
    for (const s of ["teams", "stats", "evaluate", "image"] as const) job = setStep(job, s, "pending");
    job = setStep(job, "stats", "active", "Starting");
    job = await saveJob(job);
    after(() => advance(ownerId, id));
    return json(toJobView(job), { status: 202 });
  } catch (e) {
    return errorResponse(e, "confirm");
  }
}
