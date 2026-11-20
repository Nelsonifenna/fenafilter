import "server-only";
import { randomBytes } from "node:crypto";
import { type Job, JobSchema, type Step } from "../domain/schemas";
import { AppError } from "../errors";
import { getStore, keys } from "../storage";

/**
 * Job persistence. Jobs are JSON documents in object storage, keyed by owner.
 * This keeps the MVP database-free while surviving serverless instance
 * changes. Swapping to Postgres/Supabase later means re-implementing only
 * these functions.
 */

export const JOB_TTL_HOURS = 24;
const ID_RE = /^[a-f0-9]{24}$/;

export function newJobId() {
  return randomBytes(12).toString("hex");
}

export function isValidJobId(id: string) {
  return ID_RE.test(id);
}

export function initialSteps(): Step[] {
  return [
    { id: "upload", label: "Uploading image", state: "done", detail: null },
    { id: "extract", label: "Reading football fixtures", state: "pending", detail: null },
    { id: "interpret", label: "Understanding your instruction", state: "pending", detail: null },
    { id: "teams", label: "Identifying teams", state: "pending", detail: null },
    { id: "stats", label: "Retrieving football statistics", state: "pending", detail: null },
    { id: "evaluate", label: "Evaluating your criteria", state: "pending", detail: null },
    { id: "image", label: "Preparing filtered screenshot", state: "pending", detail: null },
  ];
}

export async function saveJob(job: Job): Promise<Job> {
  const updated = { ...job, version: job.version + 1, updatedAt: new Date().toISOString() };
  JobSchema.parse(updated); // never persist a malformed record
  await getStore().put(keys.job(job.ownerId, job.id), JSON.stringify(updated), "application/json", { ttlDays: 2 });
  return updated;
}

export async function loadJob(ownerId: string, jobId: string): Promise<Job | null> {
  if (!isValidJobId(jobId)) return null;
  const obj = await getStore().get(keys.job(ownerId, jobId));
  if (!obj) return null;
  const parsed = JobSchema.safeParse(JSON.parse(obj.body.toString("utf8")));
  if (!parsed.success) return null;
  if (new Date(parsed.data.expiresAt).getTime() < Date.now()) return null;
  return parsed.data;
}

export async function requireJob(ownerId: string, jobId: string): Promise<Job> {
  const job = await loadJob(ownerId, jobId);
  if (!job) throw new AppError("NOT_FOUND", "This analysis was not found. It may have expired or been deleted.");
  return job;
}

export async function listJobs(ownerId: string): Promise<Job[]> {
  const store = getStore();
  const objects = await store.list(keys.jobPrefix(ownerId));
  const jobs = await Promise.all(
    objects
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
      .slice(0, 50)
      .map(async (o) => {
        const id = o.key.split("/").pop()!.replace(/\.json$/, "");
        return loadJob(ownerId, id).catch(() => null);
      }),
  );
  return jobs.filter((j): j is Job => Boolean(j)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteJob(ownerId: string, job: Job) {
  const store = getStore();
  const toDelete = [keys.job(ownerId, job.id), job.image.key];
  if (job.output) toDelete.push(job.output.key);
  await store.delete(toDelete);
}

export function setStep(job: Job, id: Step["id"], state: Step["state"], detail: string | null = null): Job {
  return { ...job, steps: job.steps.map((s) => (s.id === id ? { ...s, state, detail } : s)) };
}
