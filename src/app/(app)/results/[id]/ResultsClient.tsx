"use client";

import { ArrowLeft, Bot, Download, Expand, FilePlus2, Pencil, RefreshCw, RotateCcw, Sigma } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { InstructionBox } from "@/components/dashboard/InstructionBox";
import { ImageWithBoxes } from "@/components/analysis/ImageWithBoxes";
import { DecisionCard } from "@/components/results/DecisionCard";
import { Alert, Button, ButtonLink, Card, CardHeader, cn, Skeleton } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";
import { useJob } from "@/lib/client/use-job";
import type { DecisionValue, Fixture } from "@/lib/domain/schemas";

type View = "compare" | "original" | "filtered";

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
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <Alert tone="danger" title="Results unavailable">{error.message}</Alert>
        <ButtonLink href="/dashboard" variant="secondary"><ArrowLeft className="size-4" /> Back to dashboard</ButtonLink>
      </div>
    );
  }
  if (!job || job.status !== "COMPLETED" || !job.decisions || !job.extraction) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-[500px]" /></div>;
  }

  const decisions = job.decisions;
  const applied: Record<string, DecisionValue> = Object.fromEntries(decisions.map((d) => [d.fixtureId, d.decision]));
  const choices: Record<string, DecisionValue> = { ...applied, ...overrides };
  const dirty = decisions.some((d) => choices[d.fixtureId] !== applied[d.fixtureId]);
  const count = (v: DecisionValue) => decisions.filter((d) => applied[d.fixtureId] === v).length;
  const extracted = job.extraction.fixtures.filter((f) => !f.excluded).length;

  const groups: { key: DecisionValue; title: string; hint: string }[] = [
    { key: "REMOVE", title: "Removed", hint: "These rows are cut out of the filtered image." },
    { key: "NEEDS_REVIEW", title: "Needs review", hint: "Data was missing or uncertain. They stay in the image unless you choose Remove." },
    { key: "KEEP", title: "Retained", hint: "These rows stay in the filtered image." },
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/history" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> History</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Results</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {job.outputUrl && (
            <a href={downloadUrl} className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-ink hover:bg-accent-strong" download>
              <Download className="size-4" aria-hidden /> Download edited image
            </a>
          )}
          <Button variant="secondary" onClick={() => { if (!editing) setInstruction(job.instruction); setEditing((e) => !e); }}><Pencil className="size-4" /> Edit instruction</Button>
          <Button variant="secondary" onClick={() => reanalyse()} loading={busy === "reanalyse"}><RotateCcw className="size-4" /> Reanalyse</Button>
          <ButtonLink href="/dashboard" variant="ghost"><FilePlus2 className="size-4" /> New analysis</ButtonLink>
        </div>
      </div>

      {actionError && <Alert tone="danger">{actionError}</Alert>}

      {editing && (
        <Card className="p-5">
          <InstructionBox id="results-instruction" value={instruction} onChange={setInstruction} disabled={busy !== null} />
          <div className="mt-3 flex gap-2">
            <Button onClick={submitInstruction} loading={busy === "instruction"} disabled={instruction.trim().length < 3}>Interpret & review</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
          <p className="mt-2 text-xs text-faint">You will review the new rules and the same fixtures before the analysis runs again.</p>
        </Card>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Fixtures extracted", value: extracted, cls: "text-fg" },
          { label: "Retained", value: count("KEEP"), cls: "text-accent" },
          { label: "Removed", value: count("REMOVE"), cls: "text-danger" },
          { label: "Need review", value: count("NEEDS_REVIEW"), cls: "text-warn" },
        ].map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-xs text-muted">{t.label}</p>
            <p className={cn("mt-1 text-3xl font-semibold tabular-nums", t.cls)}>{t.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        {/* Images */}
        <Card className="xl:sticky xl:top-20 xl:self-start">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-0.5" role="tablist" aria-label="Image view">
              {(["compare", "original", "filtered"] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("rounded-md px-3 py-1 text-xs font-medium capitalize", view === v ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>
                  {v === "compare" ? "Before & after" : v}
                </button>
              ))}
            </div>
            {job.outputUrl && (
              <a href={job.outputUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-strong"><Expand className="size-3.5" /> Preview full size</a>
            )}
          </div>
          <div className={cn("grid max-h-[78vh] gap-4 overflow-auto p-4", view === "compare" && "sm:grid-cols-2")}>
            {(view === "compare" || view === "original") && (
              <figure>
                <figcaption className="mb-2 text-xs text-faint">Original — red rows are removed</figcaption>
                <ImageWithBoxes src={job.imageUrl} width={job.image.width} height={job.image.height} items={overlay} selectedId={selected} onSelect={(fid) => { setSelected(fid); document.getElementById(`card-${fid}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />
              </figure>
            )}
            {(view === "compare" || view === "filtered") && job.output && job.outputUrl && (
              <figure>
                <figcaption className="mb-2 text-xs text-faint">Filtered — {job.output.width}×{job.output.height}px</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element -- private, session-authenticated image route */}
                <img src={job.outputUrl} alt="Filtered screenshot" width={job.output.width} height={job.output.height} className="mx-auto block h-auto w-full rounded-lg" style={{ maxWidth: Math.min(job.output.width, 720) }} />
              </figure>
            )}
          </div>
          {job.output && job.output.warnings.length > 0 && (
            <div className="border-t border-line p-4"><Alert tone="warn" title="Image notes"><ul className="list-disc pl-5">{job.output.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert></div>
          )}
        </Card>

        {/* Decisions */}
        <div className="space-y-6">
          <Card>
            <CardHeader icon={<Bot className="size-4" />} title="Analysis summary" />
            <div className="space-y-3 p-5 text-sm">
              <p className="rounded-xl border border-line bg-surface-2 px-4 py-3">“{job.instruction}”</p>
              {job.plan && <p className="text-muted"><span className="text-fg">Applied rules:</span> {job.plan.summary}</p>}
              {job.summary ? (
                <p className="text-fg/90">{job.summary.text} <span className="text-xs text-faint">(AI-written summary · {job.summary.model})</span></p>
              ) : (
                <p className="text-muted">{count("REMOVE")} of {extracted} fixtures met your removal criteria{count("NEEDS_REVIEW") ? `, and ${count("NEEDS_REVIEW")} could not be decided reliably` : ""}.</p>
              )}
            </div>
          </Card>

          {dirty && (
            <Card className="sticky top-20 z-10 flex flex-wrap items-center justify-between gap-3 border-accent/40 p-4">
              <p className="text-sm">You changed some decisions.</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOverrides({})}>Undo</Button>
                <Button size="sm" onClick={applyChanges} loading={busy === "apply"}><RefreshCw className="size-3.5" /> Update image</Button>
              </div>
            </Card>
          )}

          {groups.map((g) => {
            const items = decisions.filter((d) => applied[d.fixtureId] === g.key && !fixtureById.get(d.fixtureId)?.excluded);
            if (items.length === 0) return null;
            return (
              <section key={g.key}>
                <h2 className="font-semibold">{g.title} <span className="text-muted">({items.length})</span></h2>
                <p className="mb-3 text-xs text-muted">{g.hint}</p>
                <div className="space-y-3">
                  {items.map((d) => {
                    const f = fixtureById.get(d.fixtureId);
                    if (!f) return null;
                    return (
                      <DecisionCard
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

          <Card>
            <CardHeader icon={<Sigma className="size-4" />} title="How the numbers are calculated" />
            <div className="space-y-2 p-5 text-xs text-muted">
              <p><span className="text-fg">Historical</span> values are frequencies from each club’s most recent finished matches (API-Football), using home games for the home side and away games for the away side.</p>
              <p><span className="text-fg">Estimates</span> come from a Poisson goal model: each side’s expected goals is the average of its own scoring rate and the opponent’s conceding rate, shrunk toward a typical league average when samples are small. Outcomes are then summed over all scorelines.</p>
              <p>Estimates are based on past results and are not guarantees. “Data confidence” describes how complete the data is, not how likely an outcome is.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
