"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { ProgressSteps } from "@/components/analysis/ProgressSteps";
import { InstructionBox } from "@/components/dashboard/InstructionBox";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, ButtonLink, Kicker, Notice } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";
import type { Fixture } from "@/lib/domain/schemas";
import { fixtureUnreadable } from "@/lib/filtering/engine";
import type { JobView } from "@/lib/jobs/view";

/* ------------------------------------------------------------------ */
/* While the pipeline runs: live progress only, nothing to click.      */
/* ------------------------------------------------------------------ */

export function RunView({ job }: { job: JobView }) {
  const active = job.steps.find((s) => s.state === "active");
  return (
    <div className="space-y-10">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <Kicker>Analysis</Kicker>
          <h1 className="mt-3 font-display text-title font-bold uppercase">Working on it</h1>
          <p className="mt-3 max-w-md text-sm text-muted">Everything runs automatically. Your filtered screenshot appears here when it is ready.</p>
        </div>
        <StatusBadge status={job.status} />
      </header>
      <div className="grid gap-x-10 gap-y-10 lg:grid-cols-12">
        <section className="min-w-0 lg:col-span-7" aria-label="Progress">
          <p className="sr-only" aria-live="polite">{active ? `${active.label}. ${active.detail ?? ""}` : ""}</p>
          <div className="sweep mb-3 h-[2px] bg-line" aria-hidden />
          <ProgressSteps steps={job.steps} />
          <p className="mt-4 font-mono text-[11px] text-faint">You can leave this page. The result stays in History for 24 hours.</p>
        </section>
        <figure className="min-w-0 lg:col-span-5">
          <figcaption className="kicker mb-2">Your screenshot</figcaption>
          <div className="max-h-[60vh] overflow-auto border border-line bg-surface p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, session-authenticated image route */}
            <img src={job.imageUrl} alt="Uploaded screenshot" width={job.image.width} height={job.image.height} className="mx-auto block h-auto w-full opacity-80" style={{ maxWidth: Math.min(job.image.width, 520) }} />
          </div>
        </figure>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Only when the whole analysis genuinely cannot continue.             */
/* ------------------------------------------------------------------ */

export function NeedsInputView({ job, onUpdate }: { job: JobView; onUpdate: (j: JobView) => void }) {
  const [instruction, setInstruction] = useState(job.instruction);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const instructionProblem = !job.plan || job.plan.status !== "ok";

  async function continueAnalysis() {
    setBusy(true);
    setErr(null);
    try {
      onUpdate(await api.reinterpret(job.id, instruction.trim(), true));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Your instruction could not be interpreted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <header className="animate-rise">
        <Kicker>Analysis paused</Kicker>
        <h1 className="mt-3 font-display text-title font-bold uppercase">One thing to check</h1>
      </header>
      {instructionProblem ? (
        <section className="space-y-4">
          <Notice tone="warn" title={job.plan?.status === "needs_clarification" ? "A quick question about your instruction" : "Your instruction could not be turned into rules"}>
            {job.plan?.clarificationQuestion ?? job.planError ?? "Please rephrase it a little more specifically."}
          </Notice>
          <InstructionBox id="clarify-instruction" value={instruction} onChange={setInstruction} disabled={busy} showExamples={false} />
          {err && <Notice tone="danger">{err}</Notice>}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={continueAnalysis} loading={busy} disabled={instruction.trim().length < 3}>
              Continue <ArrowRight className="size-4" aria-hidden />
            </Button>
            <span className="text-[13px] text-muted">The {job.extraction?.fixtures.length ?? 0} matches already read are kept.</span>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <Notice tone="warn" title="No matches could be read from this screenshot">
            Try a clearer or uncropped screenshot, or add the matches yourself.
          </Notice>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/dashboard">Try another screenshot</ButtonLink>
            <ButtonLink href={`/analyze/${job.id}`} variant="secondary">Add matches manually</ButtonLink>
          </div>
        </section>
      )}
    </div>
  );
}

export function FailedView({ job, onUpdate }: { job: JobView; onUpdate: (j: JobView) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canRetry = Boolean(job.extraction && job.plan && job.plan.status === "ok");
  async function retry() {
    setBusy(true);
    setErr(null);
    try {
      onUpdate(await api.confirm(job.id, job.extraction!.fixtures, job.plan!));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "The analysis could not be restarted.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-3xl space-y-6">
      <header className="animate-rise">
        <Kicker>Analysis</Kicker>
        <h1 className="mt-3 font-display text-title font-bold uppercase">It did not finish</h1>
      </header>
      <Notice tone="danger">{job.error?.message ?? "Something went wrong."}</Notice>
      {err && <Notice tone="danger">{err}</Notice>}
      <div className="flex flex-wrap gap-2">
        {canRetry && <Button onClick={retry} loading={busy}>Try again</Button>}
        <ButtonLink href="/dashboard" variant={canRetry ? "secondary" : "primary"}>Start a new analysis</ButtonLink>
      </div>
      <ProgressSteps steps={job.steps} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Completed: corrections for the problem rows only.                   */
/* ------------------------------------------------------------------ */

type Side = "home" | "away";
interface Problem {
  fixture: Fixture;
  unreadable: boolean;
  sides: { side: Side; status: "ambiguous" | "not_found"; query: string; candidates: { id: number; name: string; country: string | null }[] }[];
}

export function findProblems(job: JobView): Problem[] {
  const out: Problem[] = [];
  for (const f of job.extraction?.fixtures ?? []) {
    if (f.excluded) continue;
    const unreadable = fixtureUnreadable(f);
    const s = job.stats[f.id];
    const sides: Problem["sides"] = [];
    for (const side of ["home", "away"] as const) {
      const r = s?.[side].resolution;
      if (r && (r.status === "ambiguous" || r.status === "not_found")) {
        sides.push({ side, status: r.status, query: r.query, candidates: r.candidates.map((c) => ({ id: c.id, name: c.name, country: c.country })) });
      }
    }
    if (unreadable || sides.length) out.push({ fixture: f, unreadable, sides });
  }
  return out;
}
