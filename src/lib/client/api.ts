"use client";

import type { DecisionValue, Fixture, FilterPlan } from "@/lib/domain/schemas";
import type { JobSummaryView, JobView } from "@/lib/jobs/view";

/** Browser-side API helpers. Errors carry the server's user-safe message. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error?.message ?? `Request failed (${res.status}).`, res.status, body?.error?.code);
  }
  return body as T;
}

const jsonInit = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

export interface SessionInfo {
  ownerId: string;
  /** "direct": upload straight to private storage; "server": local development upload. */
  uploadMode: "direct" | "server";
  availability: { analysis: boolean; statistics: boolean };
}

export const api = {
  session: () => request<SessionInfo>("/api/session"),
  startAnalysis: (data: { imageKey: string; instruction: string; originalName?: string; plan?: FilterPlan }) => request<{ id: string }>("/api/analyze", jsonInit("POST", data)),
  job: (id: string) => request<JobView>(`/api/analyze/${id}`),
  confirm: (id: string, fixtures: Fixture[], plan: FilterPlan) => request<JobView>(`/api/analyze/${id}/confirm`, jsonInit("POST", { fixtures, plan })),
  /** autoContinue true: once understood, the analysis runs to completion automatically. */
  reinterpret: (id: string, instruction: string, autoContinue = true) => request<JobView>(`/api/analyze/${id}/instruction`, jsonInit("POST", { instruction, autoContinue })),
  process: (jobId: string, decisions: Record<string, DecisionValue>) => request<JobView>("/api/process", jsonInit("POST", { jobId, decisions })),
  history: () => request<{ items: JobSummaryView[] }>("/api/history"),
  deleteJob: (id: string) => request<{ deleted: boolean }>(`/api/history/${id}`, { method: "DELETE" }),
};
