"use client";

import { ArrowLeft, Download, Expand } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ImageWithBoxes } from "@/components/analysis/ImageWithBoxes";
import { InstructionBox } from "@/components/dashboard/InstructionBox";
import { DecisionRow } from "@/components/results/DecisionCard";
import { Button, ButtonLink, buttonClass, cn, Kicker, Notice, Skeleton } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";
import { useJob } from "@/lib/client/use-job";
import type { DecisionValue, Fixture } from "@/lib/domain/schemas";

type View = "compare" | "original" | "filtered";
const VIEW_LABEL: Record<View, string> = { compare: "Before and after", original: "Original", filtered: "Filtered" };

export function ResultsClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { job, error, replace } = useJob(id);
  // Only the user’s pending changes are stored; everything else is derived from the job.
  const [overrides, setOverrides] = useState<Record<string, DecisionValue>>({});
  const [view, setView] = useState<View>("compare");
  const [busy, setBusy] = useState<null | "apply" | "reanalyse" | "instruction">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (job && job.status !== "COMPLETED") router.replace(`/analyze/${job.id}`);
  }, [job, router]);

  const fixtureById = useMemo(() => new Map((job?.extraction?.fixtures ?? []).map((f) => [f.id, f])), [job?.extraction?.fixtures]);
  const detailById = useMemo(() => new Map((job?.details ?? []).map((d) => [d.fixtureId, d])), [job?.details]);

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
  if (!job || job.status !== "COMPLETED" || !job.decisions || !job.extraction) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-72" />
        <Skeleton className="h-28" />
        <Skeleton className="h-[480px]" />
      </div>
    );
  }

  const decisions = job.decisions;
  const applied: Record<string, DecisionValue> = Object.fromEntries(decisions.map((d) => [d.fixtureId, d.decision]));
  const choices: Record<string, DecisionValue> = { ...applied, ...overrides };
  const pending = decisions.filter((d) => choices[d.fixtureId] !== applied[d.fixtureId]).length;
  const count = (v: DecisionValue) => decisions.filter((d) => applied[d.fixtureId] === v && !fixtureById.get(d.fixtureId)?.excluded).length;
  const extracted = job.extraction.fixtures.filter((f) => !f.excluded).length;

  const groups: { key: DecisionValue; title: string; hint: string }[] = [
    { key: "REMOVE", title: "Removed", hint: "Cut out of the filtered image." },
    { key: "NEEDS_REVIEW", title: "Needs review", hint: "Data was missing or uncertain. These stay in the image unless you choose Remove." },
    { key: "KEEP", title: "Kept", hint: "These rows stay in the filtered image." },
  ];

  async function applyChanges() {
    setBusy("apply");
    setActionError(null);
    try {
      replace(await api.process(job!.id, choices));
      setOverrides({});
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not update the image.");
    } finally {
      setBusy(null);
    }
  }

  async function reanalyse(fixtures: Fixture[] = job!.extraction!.fixtures) {
    if (!job!.plan) return;
    setBusy("reanalyse");
    setActionError(null);
    try {
      await api.confirm(job!.id, fixtures, job!.plan);
      router.push(`/analyze/${job!.id}`);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not restart the analysis.");
      setBusy(null);
    }
  }

  async function submitInstruction() {
    setBusy("instruction");
    setActionError(null);
    try {
      await api.reinterpret(job!.id, instruction.trim());
      router.push(`/analyze/${job!.id}`);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not interpret the instruction.");
      setBusy(null);
    }
  }

  const pickTeam = (fixtureId: string, side: "home" | "away", teamId: number) => {
    const fixtures = job!.extraction!.fixtures.map((f) =>
      f.id === fixtureId ? { ...f, teamIds: { home: f.teamIds?.home ?? null, away: f.teamIds?.away ?? null, [side]: teamId } } : f,
    );
    void reanalyse(fixtures);
  };

  const downloadUrl = `/api/image/${job.id}/output?download=1`;
  const overlay = job.extraction.fixtures
    .filter((f) => !f.excluded)
    .map((f) => ({
      id: f.id,
      box: f.box,
      label: `${f.homeTeam} vs ${f.awayTeam}`,
      tone: (applied[f.id] === "REMOVE" ? "remove" : applied[f.id] === "NEEDS_REVIEW" ? "review" : "keep") as "remove" | "review" | "keep",
    }));

  const score = [
    { label: "Read", value: extracted, cls: "text-fg" },
    { label: "Kept", value: count("KEEP"), cls: "text-accent" },
    { label: "Removed", value: count("REMOVE"), cls: "text-danger" },
    { label: "Review", value: count("NEEDS_REVIEW"), cls: "text-warn" },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="animate-rise grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-6">
          <Link href="/history" className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted transition-colors hover:text-fg">
            <ArrowLeft className="size-3.5" aria-hidden /> History
          </Link>
          <h1 className="mt-3 font-display text-title font-bold uppercase">Filtered screenshot</h1>
          <p className="mt-2 font-mono text-[12px] text-faint">
            Ref {job.id.slice(0, 8)} · {new Date(job.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:col-span-6 lg:justify-end">
          {job.outputUrl && (
            <a href={downloadUrl} download className={buttonClass("primary", "md")}>
              <Download className="size-4" aria-hidden /> Download PNG
            </a>
          )}
          <Button variant="secondary" onClick={() => { if (!editing) setInstruction(job.instruction); setEditing((e) => !e); }} aria-expanded={editing}>Edit instruction</Button>
          <Button variant="secondary" onClick={() => reanalyse()} loading={busy === "reanalyse"}>Reanalyse</Button>
          <ButtonLink href="/dashboard" variant="ghost">New analysis</ButtonLink>
        </div>
      </header>

      {actionError && <Notice tone="danger">{actionError}</Notice>}

      <div className="reveal" data-open={editing}>
        <div inert={!editing}>
          <section className="border-t border-line pt-5">
            <Kicker>Edit instruction</Kicker>
            <div className="mt-4 grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <InstructionBox id="results-instruction" value={instruction} onChange={setInstruction} disabled={busy !== null} showExamples={false} />
              </div>
              <div className="lg:col-span-4 lg:col-start-9">
                <p className="text-sm text-muted">You will review the new rules, with the same fixtures, before the analysis runs again.</p>
                <div className="mt-4 flex gap-2">
                  <Button onClick={submitInstruction} loading={busy === "instruction"} disabled={instruction.trim().length < 3}>Interpret and review</Button>
                  <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Scoreboard */}
      <section aria-label="Summary" className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
        {score.map((s, i) => (
          <div key={s.label} className={cn("bg-ink py-5 pr-4", i % 2 === 1 && "pl-4 sm:pl-6", i === 2 && "sm:pl-6")}>
            <p className="kicker">{s.label}</p>
            <p className={cn("mt-2 font-display text-score font-bold tnum", s.cls)}>{String(s.value).padStart(2, "0")}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-x-10 gap-y-14 xl:grid-cols-12">
        {/* Images */}
        <section className="min-w-0 xl:sticky xl:top-20 xl:col-span-6 xl:self-start" aria-label="Images">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <div className="flex border border-line-strong" role="tablist" aria-label="Image view">
              {(["compare", "original", "filtered"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn("px-3 py-1.5 text-[12px] transition-colors", view === v ? "bg-fg text-ink" : "text-muted hover:text-fg")}
                >
                  {VIEW_LABEL[v]}
                </button>
              ))}
            </div>
            {job.outputUrl && (
              <a href={job.outputUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted transition-colors hover:text-fg">
                <Expand className="size-3.5" aria-hidden /> Full size
              </a>
            )}
          </div>
          <div className={cn("grid max-h-[78vh] gap-px overflow-auto border border-line bg-line", view === "compare" && "sm:grid-cols-2")}>
            {(view === "compare" || view === "original") && (
              <figure className="bg-surface p-3">
                <figcaption className="mb-2 flex justify-between font-mono text-[11px] text-faint">
                  <span>Original</span>
                  <span>hatched rows are removed</span>
                </figcaption>
                <ImageWithBoxes
                  src={job.imageUrl}
                  width={job.image.width}
                  height={job.image.height}
                  items={overlay}
                  selectedId={selected}
                  onSelect={(fid) => { setSelected(fid); document.getElementById(`card-${fid}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                />
              </figure>
            )}
            {(view === "compare" || view === "filtered") && job.output && job.outputUrl && (
              <figure className="bg-surface p-3">
                <figcaption className="mb-2 flex justify-between font-mono text-[11px] text-faint">
                  <span>Filtered</span>
                  <span className="tnum">{job.output.width} × {job.output.height} px</span>
                </figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element -- private, session-authenticated image route */}
                <img src={job.outputUrl} alt="Filtered screenshot" width={job.output.width} height={job.output.height} className="mx-auto block h-auto w-full" style={{ maxWidth: Math.min(job.output.width, 720) }} />
              </figure>
            )}
          </div>
          {job.output && job.output.warnings.length > 0 && (
            <Notice tone="warn" className="mt-4" title="Image notes">
              <ul className="space-y-0.5">{job.output.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </Notice>
          )}
        </section>

        {/* Decisions */}
        <div className="min-w-0 space-y-12 xl:col-span-6">
          <section>
            <Kicker>Summary</Kicker>
            <blockquote className="mt-3 border-l-2 border-line-strong pl-4 text-lg leading-snug">{job.instruction}</blockquote>
            {job.plan && <p className="mt-4 text-sm text-muted"><span className="text-fg">Rules applied.</span> {job.plan.summary}</p>}
            {job.summary ? (
              <p className="mt-3 text-sm text-fg/85">
                {job.summary.text} <span className="font-mono text-[11px] text-faint">AI summary</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-fg/85">
                {count("REMOVE")} of {extracted} fixtures met your removal criteria{count("NEEDS_REVIEW") ? `, and ${count("NEEDS_REVIEW")} could not be decided reliably` : ""}.
              </p>
            )}
          </section>

          {pending > 0 && (
            <div className="animate-rise sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 border-l-2 border-accent bg-surface-2 py-3 pr-3 pl-4">
              <p className="text-sm">
                <span className="font-mono tnum">{pending}</span> decision{pending === 1 ? "" : "s"} changed. The image updates when you apply.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOverrides({})}>Undo</Button>
                <Button size="sm" onClick={applyChanges} loading={busy === "apply"}>Update image</Button>
              </div>
            </div>
          )}

          {groups.map((g) => {
            const items = decisions.filter((d) => applied[d.fixtureId] === g.key && !fixtureById.get(d.fixtureId)?.excluded);
            if (items.length === 0) return null;
            return (
              <section key={g.key} aria-labelledby={`group-${g.key}`}>
                <div className="flex items-baseline justify-between gap-4">
                  <h2 id={`group-${g.key}`} className="font-display text-section font-semibold uppercase">
                    {g.title} <span className="font-mono text-base font-normal text-faint tnum">{items.length}</span>
                  </h2>
                  <p className="hidden max-w-xs text-right text-[12px] text-muted sm:block">{g.hint}</p>
                </div>
                <div className="mt-3 border-b border-line">
                  {items.map((d) => {
                    const f = fixtureById.get(d.fixtureId);
                    if (!f) return null;
                    return (
                      <DecisionRow
                        key={d.fixtureId}
                        fixture={f}
                        decision={d}
                        chosen={choices[d.fixtureId] ?? d.decision}
                        onChoose={(v) => setOverrides((c) => ({ ...c, [d.fixtureId]: v }))}
                        stats={job.stats[d.fixtureId]}
                        detail={detailById.get(d.fixtureId)}
                        onPickTeam={(side, teamId) => pickTeam(d.fixtureId, side, teamId)}
                        selected={selected === d.fixtureId}
                        onSelect={() => setSelected(d.fixtureId)}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="border-t border-line pt-5">
            <Kicker>Method</Kicker>
            <div className="mt-3 grid gap-4 text-[13px] text-muted sm:grid-cols-2">
              <p><span className="text-fg">Historical</span> values come from each club’s most recent finished matches, using home games for the home side and away games for the away side.</p>
              <p><span className="text-fg">Estimates</span> come from a statistical goal model built on how often each club scores and concedes, adjusted towards a typical average when there are only a few matches to go on.</p>
              <p className="sm:col-span-2">Estimates are based on past results and are not guarantees. Data completeness describes how much of the required data was available, not how likely an outcome is.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
