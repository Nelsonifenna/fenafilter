"use client";

import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ImageWithBoxes } from "@/components/analysis/ImageWithBoxes";
import { InstructionBox } from "@/components/dashboard/InstructionBox";
import { MatchItem, useReviewFixes } from "@/components/results/Report";
import { FailedView, NeedsInputView, RunView } from "@/components/results/RunStates";
import { Button, ButtonLink, buttonClass, cn, Kicker, Notice, Skeleton } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";
import { savePlaybook } from "@/lib/client/playbooks";
import { useJob } from "@/lib/client/use-job";
import type { DecisionValue, Fixture } from "@/lib/domain/schemas";
import { answerSummary, countOutcome } from "@/lib/explain";
import type { JobView } from "@/lib/jobs/view";

const RUNNING = ["PENDING", "UPLOADING", "EXTRACTING", "FETCHING_STATISTICS", "ANALYSING", "PROCESSING_IMAGE"];

export function ResultsClient() {
  const { id } = useParams<{ id: string }>();
  const { job, error, replace, reload } = useJob(id);

  // The written summary is finished after the results; fetch it a few times if it is still on its way.
  const [summaryPolls, setSummaryPolls] = useState(0);
  const awaitingSummary = Boolean(job && job.status === "COMPLETED" && !job.summary && job.plan);
  useEffect(() => {
    if (!awaitingSummary || summaryPolls >= 6) return;
    const t = setTimeout(() => {
      void reload().then(() => setSummaryPolls((n) => n + 1));
    }, 5000);
    return () => clearTimeout(t);
  }, [awaitingSummary, summaryPolls, reload]);

  if (error && !job) {
    return (
      <div className="max-w-xl space-y-6">
        <Kicker>Results</Kicker>
        <h1 className="font-display text-title font-bold uppercase">Not available</h1>
        <Notice tone="danger">{error.message}</Notice>
        <ButtonLink href="/dashboard" variant="secondary"><ArrowLeft className="size-4" /> Back to workspace</ButtonLink>
      </div>
    );
  }
  if (job && RUNNING.includes(job.status)) return <RunView job={job} />;
  if (job?.status === "AWAITING_CONFIRMATION") return <NeedsInputView job={job} onUpdate={replace} />;
  if (job?.status === "FAILED") return <FailedView job={job} onUpdate={replace} />;
  if (!job || job.status !== "COMPLETED" || !job.decisions || !job.extraction) {
    return (
      <div className="max-w-3xl space-y-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24" />
        <Skeleton className="h-[420px]" />
      </div>
    );
  }
  return <Report job={job} replace={replace} reload={reload} />;
}

/* ------------------------------------------------------------------ */
/* The completed report: answer first, screenshot next, detail on demand */
/* ------------------------------------------------------------------ */

function Report({ job, replace, reload }: { job: JobView; replace: (j: JobView) => void; reload: () => Promise<unknown> }) {
  // Only the user’s pending override choices are stored; everything else is derived from the job.
  const [overrides, setOverrides] = useState<Record<string, DecisionValue>>({});
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState<null | "apply" | "reanalyse" | "instruction">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState(job.instruction);
  const [playbookName, setPlaybookName] = useState("");
  const [playbookMsg, setPlaybookMsg] = useState<string | null>(null);

  const update = (j: JobView) => {
    setActionError(null);
    setOverrides({});
    replace(j);
  };
  // A second request while an update is already running is not an error: refresh instead.
  const onConflict = () => {
    setActionError(null);
    void reload();
  };
  const fixes = useReviewFixes(job, update, onConflict);

  const fixtures = job.extraction!.fixtures;
  const fixtureById = useMemo(() => new Map(fixtures.map((f) => [f.id, f])), [fixtures]);
  const detailById = useMemo(() => new Map(job.details.map((d) => [d.fixtureId, d])), [job.details]);
  const decisions = job.decisions!;
  const applied: Record<string, DecisionValue> = Object.fromEntries(decisions.map((d) => [d.fixtureId, d.decision]));
  const choices: Record<string, DecisionValue> = { ...applied, ...overrides };
  const pending = decisions.filter((d) => choices[d.fixtureId] !== applied[d.fixtureId]).length;

  const leagueOf = (f: Fixture) => job.stats[f.id]?.league?.name ?? f.competition ?? null;
  const counts = countOutcome(fixtures, decisions, applied, leagueOf);
  const answer = answerSummary(counts);

  async function run(kind: "apply" | "reanalyse" | "instruction", call: () => Promise<JobView>, fallback: string) {
    if (busy) return;
    setBusy(kind);
    setActionError(null);
    try {
      update(await call());
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) onConflict();
      else setActionError(e instanceof ApiError ? e.message : fallback);
    } finally {
      setBusy(null);
    }
  }
  const applyChanges = () => run("apply", () => api.process(job.id, choices), "Could not update the image.");
  const reanalyse = () => run("reanalyse", () => api.confirm(job.id, fixtures, job.plan!), "Could not restart the analysis.");
  const runInstruction = () => run("instruction", () => api.reinterpret(job.id, instruction.trim(), true), "Could not interpret the instruction.");

  function saveAsPlaybook() {
    if (!job.plan) return;
    const pb = savePlaybook(playbookName || job.plan.summary.slice(0, 40), job.instruction, job.plan);
    setPlaybookMsg(pb ? `Saved “${pb.name}”. Choose it in the workspace to run these rules on another screenshot.` : "This browser does not allow saving playbooks.");
    if (pb) setPlaybookName("");
  }

  const group = (v: DecisionValue) => decisions.filter((d) => applied[d.fixtureId] === v && !fixtureById.get(d.fixtureId)?.excluded);
  const sections: { key: DecisionValue; title: string; note: string }[] = [
    { key: "REMOVE", title: "Removed", note: "These rows were cut from your screenshot." },
    { key: "NEEDS_REVIEW", title: "Needs a closer look", note: "FenaFilter could not judge these reliably, so they stay in your screenshot." },
    { key: "KEEP", title: "Kept", note: "These passed your playbook and stay in your screenshot." },
  ];

  // League breakdown (plain text, in “More options”).
  const byLeague = new Map<string, { n: number; KEEP: number; REMOVE: number; NEEDS_REVIEW: number }>();
  for (const d of decisions) {
    const f = fixtureById.get(d.fixtureId);
    if (!f || f.excluded) continue;
    const name = leagueOf(f) ?? "Competition not identified";
    const row = byLeague.get(name) ?? { n: 0, KEEP: 0, REMOVE: 0, NEEDS_REVIEW: 0 };
    row.n++;
    row[applied[d.fixtureId]!]++;
    byLeague.set(name, row);
  }

  const overlay = fixtures
    .filter((f) => !f.excluded)
    .map((f) => ({
      id: f.id,
      box: f.box,
      label: `${f.homeTeam} vs ${f.awayTeam}`,
      tone: (applied[f.id] === "REMOVE" ? "remove" : applied[f.id] === "NEEDS_REVIEW" ? "review" : "keep") as "remove" | "review" | "keep",
    }));

  const imagePanel = (
    <section aria-labelledby="image-title" className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="image-title" className="text-[15px] font-semibold">{showOriginal ? "Your original screenshot" : "Your filtered screenshot"}</h2>
        {job.output && !showOriginal && <span className="font-mono text-[12px] text-faint tnum">{job.output.width} × {job.output.height}</span>}
      </div>
      <div className="mt-3 max-h-[70vh] overflow-auto bg-surface p-2 sm:p-3">
        {showOriginal ? (
          <ImageWithBoxes
            src={job.imageUrl}
            width={job.image.width}
            height={job.image.height}
            items={overlay}
            onSelect={(fid) => document.getElementById(`card-${fid}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        ) : job.outputUrl && job.output ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, session-authenticated image route
          <img src={job.outputUrl} alt="Filtered screenshot" width={job.output.width} height={job.output.height} className="mx-auto block h-auto w-full" style={{ maxWidth: Math.min(job.output.width, 640) }} />
        ) : (
          <p className="p-6 text-sm text-muted">The filtered screenshot is not available.</p>
        )}
      </div>
      <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        {job.outputUrl && (
          <a href={`/api/image/${job.id}/output?download=1`} download className={buttonClass("primary", "lg", "w-full sm:w-auto")}>
            <Download className="size-4" aria-hidden /> Download filtered screenshot
          </a>
        )}
        <Button variant="secondary" size="lg" className="w-full sm:w-auto" onClick={() => setShowOriginal((o) => !o)} aria-pressed={showOriginal}>
          {showOriginal ? "Show filtered" : "Compare with original"}
        </Button>
      </div>
      {showOriginal && <p className="mt-2 text-[13px] text-muted">Hatched rows were removed. Tap a row to read why.</p>}
      {job.output && job.output.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-[13px] text-warn">{job.output.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}
      <ButtonLink href="/dashboard" variant="ghost" className="mt-3 w-full sm:w-auto">Analyze another screenshot</ButtonLink>
    </section>
  );

  return (
    <div className="pb-24">
      {/* Answer */}
      <header className="animate-rise max-w-3xl">
        <Link href="/history" className="inline-flex min-h-10 items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg">
          <ArrowLeft className="size-3.5" aria-hidden /> History
        </Link>
        <p className="kicker mt-2">Result · {new Date(job.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
        <h1 className="mt-4 text-[1.375rem] leading-snug font-medium text-pretty sm:text-[1.75rem] sm:leading-[1.3]">{answer}</h1>
        <p className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[15px]">
          <span><strong className="font-semibold tnum">{counts.total}</strong> analyzed</span>
          <span><span className="font-semibold text-accent tnum">{counts.kept}</span> kept</span>
          <span><span className="font-semibold text-danger tnum">{counts.removed}</span> removed</span>
          {counts.review > 0 && <span><span className="font-semibold text-warn tnum">{counts.review}</span> need a closer look</span>}
        </p>
      </header>

      {actionError && <Notice tone="danger" className="mt-6 max-w-3xl">{actionError}</Notice>}

      <div className="mt-10 grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        {/* Screenshot: right after the answer on phones, beside the report on wide screens */}
        <div className="lg:sticky lg:top-20 lg:order-2 lg:self-start">{imagePanel}</div>

        {/* Report */}
        <div className="min-w-0 space-y-12 lg:order-1">
          <section aria-labelledby="overview">
            <h2 id="overview" className="font-display text-section font-semibold uppercase">Overview</h2>
            <div className="mt-4 max-w-prose space-y-3 text-[15px] leading-relaxed text-fg/85">
              {job.plan && <p><span className="text-fg">Your playbook:</span> {job.plan.summary}</p>}
              {job.summary && (
                <p>
                  {job.summary.text} <span className="text-[12px] text-faint">AI summary</span>
                </p>
              )}
              {job.notices?.map((n) => <p key={n} className="text-warn">{n}</p>)}
            </div>
          </section>

          {sections.map((s) => {
            const items = group(s.key);
            if (items.length === 0) return null;
            return (
              <section key={s.key} aria-labelledby={`group-${s.key}`}>
                <h2 id={`group-${s.key}`} className="flex items-baseline gap-3 font-display text-section font-semibold uppercase">
                  {s.title} <span className="font-sans text-base font-normal text-faint tnum">{items.length}</span>
                </h2>
                <p className="mt-1 text-[14px] text-muted">{s.note}</p>
                <div className="mt-2 divide-y divide-line">
                  {items.map((d) => {
                    const f = fixtureById.get(d.fixtureId)!;
                    return (
                      <MatchItem
                        key={d.fixtureId}
                        fixture={f}
                        decision={d}
                        chosen={choices[d.fixtureId] ?? d.decision}
                        onChoose={(v) => setOverrides((c) => ({ ...c, [d.fixtureId]: v }))}
                        plan={job.plan}
                        league={leagueOf(f)}
                        stats={job.stats[d.fixtureId]}
                        detail={detailById.get(d.fixtureId)}
                      >
                        {s.key === "NEEDS_REVIEW" ? fixes.controls(d.fixtureId) : null}
                      </MatchItem>
                    );
                  })}
                </div>
                {s.key === "NEEDS_REVIEW" && fixes.footer}
              </section>
            );
          })}

          {/* Secondary actions and background */}
          <section aria-labelledby="more" className="border-t border-line pt-8">
            <h2 id="more" className="text-[15px] font-semibold">More options</h2>
            <div className="mt-4 space-y-2">
              <details className="faq group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[15px]">
                  Change the instruction and run again <span className="faq-sign text-muted transition-transform">+</span>
                </summary>
                <div className="pb-4">
                  <InstructionBox id="results-instruction" value={instruction} onChange={setInstruction} disabled={busy !== null} showExamples={false} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={runInstruction} loading={busy === "instruction"} disabled={instruction.trim().length < 3}>Run again</Button>
                    <Button variant="secondary" onClick={reanalyse} loading={busy === "reanalyse"}>Re-run the same rules</Button>
                  </div>
                </div>
              </details>
              {job.plan?.status === "ok" && (
                <details className="faq group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[15px]">
                    Save these rules as a playbook <span className="faq-sign text-muted transition-transform">+</span>
                  </summary>
                  <form className="flex flex-wrap gap-2 pb-4" onSubmit={(e) => { e.preventDefault(); saveAsPlaybook(); }}>
                    <label htmlFor="playbook-name" className="sr-only">Playbook name</label>
                    <input id="playbook-name" value={playbookName} onChange={(e) => setPlaybookName(e.target.value.slice(0, 60))} placeholder="Playbook name" className={cn("h-11 min-w-0 flex-1 rounded-[2px] border border-line bg-ink px-3 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none")} />
                    <Button type="submit" variant="secondary" size="lg">Save</Button>
                    {playbookMsg && <p className="w-full text-[13px] text-muted" role="status">{playbookMsg}</p>}
                  </form>
                </details>
              )}
              {byLeague.size > 0 && (
                <details className="faq group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[15px]">
                    Breakdown by competition <span className="faq-sign text-muted transition-transform">+</span>
                  </summary>
                  <ul className="space-y-1.5 pb-4 text-[14px]">
                    {[...byLeague.entries()].sort((a, b) => b[1].n - a[1].n).map(([name, r]) => (
                      <li key={name}>
                        <span className="text-fg">{name}</span>
                        <span className="text-muted">: {r.n} analyzed, {r.KEEP} kept, {r.REMOVE} removed{r.NEEDS_REVIEW ? `, ${r.NEEDS_REVIEW} to check` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <details className="faq group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[15px]">
                  How the figures are calculated <span className="faq-sign text-muted transition-transform">+</span>
                </summary>
                <div className="max-w-prose space-y-2 pb-4 text-[14px] leading-relaxed text-muted">
                  <p>Historical figures come from each club’s most recent finished matches, previous meetings between the clubs, and the league’s season results. Unless your rule says otherwise, home figures use home games and away figures use away games.</p>
                  <p>Estimates come from a statistical goal model built on how often each club scores and concedes, adjusted towards the league’s average when there are only a few matches to go on.</p>
                  <p>Past results do not guarantee future outcomes. Nothing here is betting advice.</p>
                  {job.plan && job.plan.unsupported.length > 0 && (
                    <p className="text-warn">Not checked, because the data is not available: {job.plan.unsupported.join("; ")}.</p>
                  )}
                </div>
              </details>
              <Link href={`/analyze/${job.id}`} className="flex min-h-11 items-center text-[15px] text-muted transition-colors hover:text-fg">
                Adjust matches and rules in detail
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* Pending manual overrides */}
      {pending > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-accent/50 bg-ink/95 backdrop-blur">
          <div className="frame flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="text-[14px]"><span className="font-semibold tnum">{pending}</span> {pending === 1 ? "change" : "changes"} to apply to your screenshot</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOverrides({})}>Undo</Button>
              <Button onClick={applyChanges} loading={busy === "apply"}>Update screenshot</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
