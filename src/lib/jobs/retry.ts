/**
 * Job-level retry scheduling for temporary AI overloads (pure, unit-tested).
 *
 * Request-level retries and model fallback cover short blips. When every
 * configured model is overloaded for minutes (observed Nov 2026: 503 "high
 * demand" across models), the job waits and resumes on a later status poll
 * instead of failing immediately.
 */
export const JOB_RETRY_DELAYS_S = [20, 40, 60, 90] as const;

export interface JobRetryState {
  count: number;
  at: string;
}

/** Next retry for a job, or null when the retry budget is used up. */
export function nextJobRetry(current: JobRetryState | null | undefined, now: number): JobRetryState | null {
  const count = current?.count ?? 0;
  const delay = JOB_RETRY_DELAYS_S[count];
  if (delay === undefined) return null;
  return { count: count + 1, at: new Date(now + delay * 1000).toISOString() };
}

/** True when a scheduled retry is still in the future (the worker should wait). */
export function retryPending(retry: JobRetryState | null | undefined, now: number): boolean {
  return Boolean(retry && new Date(retry.at).getTime() > now);
}

export function retryMessage(retry: JobRetryState, now: number): string {
  const secs = Math.max(1, Math.round((new Date(retry.at).getTime() - now) / 1000));
  return `High demand right now — trying again automatically in ${secs} s (attempt ${retry.count + 1} of ${JOB_RETRY_DELAYS_S.length + 1}).`;
}
