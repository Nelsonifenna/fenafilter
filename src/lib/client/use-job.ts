"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JobView } from "@/lib/jobs/view";
import { api, ApiError } from "./api";

const ACTIVE = new Set(["PENDING", "UPLOADING", "EXTRACTING", "FETCHING_STATISTICS", "ANALYSING", "PROCESSING_IMAGE"]);

/** Polls a job while it is running. Progress shown in the UI always comes from the server's real state. */
export function useJob(id: string) {
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await api.job(id);
      setJob(j);
      setError(null);
      return j;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("Failed to load the analysis.", 0));
      return null;
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const tick = async (delay: number) => {
      const j = await load();
      if (cancelled) return;
      if (j && ACTIVE.has(j.status)) {
        timer.current = setTimeout(() => tick(Math.min(delay * 1.3, 4000)), delay);
      }
    };
    void tick(1200);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  /** Restart polling (e.g. after confirming fixtures). */
  const replace = useCallback(
    (j: JobView) => {
      setJob(j);
      if (ACTIVE.has(j.status)) {
        if (timer.current) clearTimeout(timer.current);
        const poll = async (delay: number) => {
          const next = await load();
          if (next && ACTIVE.has(next.status)) timer.current = setTimeout(() => poll(Math.min(delay * 1.3, 4000)), delay);
        };
        timer.current = setTimeout(() => poll(1200), 1200);
      }
    },
    [load],
  );

  return { job, error, reload: load, replace };
}
