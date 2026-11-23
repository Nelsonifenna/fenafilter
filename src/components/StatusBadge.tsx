import type { JobStatus } from "@/lib/domain/schemas";
import { Dot } from "./ui/primitives";

const MAP: Record<JobStatus, { label: string; tone: "neutral" | "accent" | "danger" | "warn"; live?: boolean }> = {
  PENDING: { label: "Pending", tone: "neutral" },
  UPLOADING: { label: "Uploading", tone: "neutral", live: true },
  EXTRACTING: { label: "Reading fixtures", tone: "neutral", live: true },
  AWAITING_CONFIRMATION: { label: "Awaiting your review", tone: "warn" },
  FETCHING_STATISTICS: { label: "Fetching statistics", tone: "neutral", live: true },
  ANALYSING: { label: "Analysing", tone: "neutral", live: true },
  PROCESSING_IMAGE: { label: "Editing image", tone: "neutral", live: true },
  COMPLETED: { label: "Completed", tone: "accent" },
  FAILED: { label: "Failed", tone: "danger" },
};

/** Job status as a dot + label (live states blink like a match clock). */
export function StatusBadge({ status }: { status: JobStatus }) {
  const s = MAP[status];
  return (
    <Dot tone={s.live ? "accent" : s.tone} pulse={s.live}>
      {s.label}
    </Dot>
  );
}

export function jobHref(id: string, status: JobStatus) {
  return status === "COMPLETED" ? `/results/${id}` : `/analyze/${id}`;
}
