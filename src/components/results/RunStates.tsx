"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ProgressSteps } from "@/components/analysis/ProgressSteps";
import { InstructionBox } from "@/components/dashboard/InstructionBox";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, ButtonLink, cn, inputClass, Kicker, Notice } from "@/components/ui/primitives";
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

export function CorrectionsPanel({ job, onUpdate }: { job: JobView; onUpdate: (j: JobView) => void }) {
  const problems = findProblems(job);
  const [edits, setEdits] = useState<Record<string, { homeTeam?: string; awayTeam?: string; home?: number; away?: number; excluded?: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (problems.length === 0 || !job.plan || job.plan.status !== "ok") return null;

  const set = (id: string, patch: (typeof edits)[string]) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const changed = Object.keys(edits).length > 0;

  async function rerun() {
    setBusy(true);
    setErr(null);
    try {
      const fixtures = job.extraction!.fixtures.map((f) => {
        const e = edits[f.id];
        if (!e) return f;
        const homeTeam = e.homeTeam ?? f.homeTeam;
        const awayTeam = e.awayTeam ?? f.awayTeam;
        // A corrected name clears the "unreadable" flag; a chosen club is used directly.
        const issues = e.homeTeam !== undefined || e.awayTeam !== undefined ? f.issues.filter((i) => !/could not be read|unreadable/i.test(i)) : f.issues;
        return {
          ...f,
          homeTeam,
          awayTeam,
          issues,
          excluded: e.excluded ?? f.excluded,
          userEdited: true,
          teamIds: { home: e.home ?? f.teamIds?.home ?? null, away: e.away ?? f.teamIds?.away ?? null },
        };
      });
      onUpdate(await api.confirm(job.id, fixtures, job.plan!));
      setEdits({});
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "The corrections could not be applied.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="corrections" className="border-l-2 border-warn bg-surface px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="corrections" className="font-semibold">
          {problems.length} match{problems.length === 1 ? "" : "es"} could not be checked
        </h2>
        <span className="text-[12px] text-muted">They stay in your screenshot as Review. Fix them to include them in the filtering.</span>
      </div>
      <ul className="mt-3">
        {problems.map((p) => {
          const e = edits[p.fixture.id] ?? {};
          return (
            <li key={p.fixture.id} className="border-t border-line py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-mono text-[11px] text-faint">{p.fixture.id.slice(-2)} </span>
                  {p.fixture.homeTeam || "?"} <span className="text-faint">v</span> {p.fixture.awayTeam || "?"}
                </p>
                <label className="flex items-center gap-2 text-[12px] text-muted">
                  <input type="checkbox" className="size-3.5 accent-[var(--color-accent)]" checked={e.excluded ?? false} onChange={(ev) => set(p.fixture.id, { excluded: ev.target.checked })} />
                  Not a match
                </label>
              </div>
              {!e.excluded && (p.unreadable || p.sides.some((s) => s.status === "not_found")) && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(["home", "away"] as const).map((side) => {
                    const key = side === "home" ? "homeTeam" : "awayTeam";
                    const show = p.unreadable || p.sides.some((s) => s.side === side && s.status === "not_found");
                    if (!show) return <span key={side} className="hidden sm:block" />;
                    return (
                      <input
                        key={side}
                        aria-label={`${side} team name`}
                        className={cn(inputClass, "h-9")}
                        placeholder={side === "home" ? "Home team" : "Away team"}
                        value={e[key] ?? p.fixture[key]}
                        onChange={(ev) => set(p.fixture.id, { [key]: ev.target.value.slice(0, 80) })}
                      />
                    );
                  })}
                </div>
              )}
              {!e.excluded &&
                p.sides
                  .filter((s) => s.status === "ambiguous" && s.candidates.length > 0)
                  .map((s) => (
                    <div key={s.side} className="mt-2">
                      <p className="text-[12px] text-muted">Which club is “{s.query}”?</p>
                      <div className="mt-1 flex flex-wrap gap-px bg-line p-px">
                        {s.candidates.map((c) => {
                          const chosen = e[s.side] === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => set(p.fixture.id, { [s.side]: c.id })}
                              aria-pressed={chosen}
                              className={cn("px-3 py-1.5 text-left text-[13px] transition-colors", chosen ? "bg-accent text-accent-ink" : "bg-ink hover:bg-surface-2")}
                            >
                              {c.name}
                              {c.country && <span className={cn("ml-2 font-mono text-[11px]", chosen ? "text-accent-ink/70" : "text-faint")}>{c.country}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
            </li>
          );
        })}
      </ul>
      {err && <Notice tone="danger" className="mt-3">{err}</Notice>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={rerun} loading={busy} disabled={!changed}>Re-run with corrections</Button>
        <span className="text-[12px] text-faint">Only these matches are checked again; everything else is reused.</span>
      </div>
    </section>
  );
}

export function AdvancedLink({ id }: { id: string }) {
  return (
    <Link href={`/analyze/${id}`} className="font-mono text-[12px] text-muted transition-colors hover:text-fg">
      Adjust matches and rules
    </Link>
  );
}
