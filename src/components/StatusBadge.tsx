import type { JobStatus } from "@/lib/domain/schemas";
import { Dot } from "./ui/primitives";

const MAP: Record<JobStatus, { label: string; tone: "neutral" | "accent" | "danger" | "warn"; live?: boolean }> = {
  PENDING: { label: "Pending", tone: "neutral" },
  UPLOADING: { label: "Uploading", tone: "neutral", live: true },
  EXTRACTING: { label: "Reading matches", tone: "neutral", live: true },
  AWAITING_CONFIRMATION: { label: "Needs your input", tone: "warn" },
  FETCHING_STATISTICS: { label: "Fetching statistics", tone: "neutral", live: true },
  ANALYSING: { label: "Filtering matches", tone: "neutral", live: true },
  PROCESSING_IMAGE: { label: "Preparing image", tone: "neutral", live: true },
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

/** Every analysis opens on its results page, which shows live progress until it is finished. */
export function jobHref(id: string, _status?: JobStatus) {
  void _status;
  return `/results/${id}`;
}
