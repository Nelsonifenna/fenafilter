import type { JobStatus } from "@/lib/domain/schemas";
import { Badge } from "./ui/primitives";

const MAP: Record<JobStatus, { label: string; tone: "neutral" | "accent" | "danger" | "warn" | "info" }> = {
  PENDING: { label: "Pending", tone: "neutral" },
  UPLOADING: { label: "Uploading", tone: "info" },
  EXTRACTING: { label: "Reading fixtures", tone: "info" },
  AWAITING_CONFIRMATION: { label: "Needs your review", tone: "warn" },
  FETCHING_STATISTICS: { label: "Fetching statistics", tone: "info" },
  ANALYSING: { label: "Analysing", tone: "info" },
  PROCESSING_IMAGE: { label: "Editing image", tone: "info" },
  COMPLETED: { label: "Completed", tone: "accent" },
  FAILED: { label: "Failed", tone: "danger" },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const s = MAP[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function jobHref(id: string, status: JobStatus) {
  return status === "COMPLETED" ? `/results/${id}` : `/analyze/${id}`;
}
