"use client";

import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FixtureEditor, LOW_CONFIDENCE } from "@/components/analysis/FixtureEditor";
import { ImageWithBoxes, type OverlayItem } from "@/components/analysis/ImageWithBoxes";
import { PlanEditor } from "@/components/analysis/PlanEditor";
import { ProgressSteps } from "@/components/analysis/ProgressSteps";
import { InstructionBox } from "@/components/dashboard/InstructionBox";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, ButtonLink, Kicker, Notice, SectionHead, Skeleton } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";
import { useJob } from "@/lib/client/use-job";
import type { FilterPlan, Fixture } from "@/lib/domain/schemas";

export function AnalyzeClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { job, error, replace } = useJob(id);

  // Local state holds only the user's unsaved edits ("drafts"); everything else
  // is derived from the server's job record, so it can never go stale.
  const [fixtureDraft, setFixtures] = useState<Fixture[] | null>(null);
  const [planDraft, setPlan] = useState<FilterPlan | null>(null);
  const [instructionDraft, setInstruction] = useState<string | null>(null);
  const [editingInstruction, setEditingInstruction] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<"confirm" | "reinterpret" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fixtures: Fixture[] | null = fixtureDraft ?? (job?.status === "AWAITING_CONFIRMATION" ? job.extraction?.fixtures ?? null : null);
  const plan: FilterPlan | null = planDraft ?? job?.plan ?? null;
  const instruction = instructionDraft ?? job?.instruction ?? "";

  useEffect(() => {
    if (job?.status === "COMPLETED") router.replace(`/results/${job.id}`);
  }, [job?.status, job?.id, router]);

  const overlay: OverlayItem[] = useMemo(
    () =>
      (fixtures ?? job?.extraction?.fixtures ?? []).map((f) => ({
        id: f.id,
        box: f.box,
        label: `${f.homeTeam || "?"} vs ${f.awayTeam || "?"}`,
        tone: f.excluded ? "excluded" : f.confidence < LOW_CONFIDENCE || f.issues.length ? "warn" : "neutral",
      })),
    [fixtures, job?.extraction?.fixtures],
  );

  if (error && !job) {
    return (
      <div className="max-w-xl space-y-6">
        <Kicker>Analysis</Kicker>
        <h1 className="font-display text-title font-bold uppercase">Not available</h1>
        <Notice tone="danger">{error.message}</Notice>
        <ButtonLink href="/dashboard" variant="secondary"><ArrowLeft className="size-4" /> Back to workspace</ButtonLink>
      </div>
    );
  }
  if (!job) {
    return (
      <div className="grid gap-10 lg:grid-cols-12">
        <Skeleton className="h-[520px] lg:col-span-5" />
        <div className="space-y-4 lg:col-span-7">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const awaiting = job.status === "AWAITING_CONFIRMATION";
  const needsClarification = plan?.status === "needs_clarification";
  const missingNames = (fixtures ?? []).some((f) => !f.excluded && (!f.homeTeam.trim() || !f.awayTeam.trim()));
  const activeFixtures = (fixtures ?? []).filter((f) => !f.excluded).length;
  const canConfirm = awaiting && fixtures && plan && plan.status === "ok" && !missingNames && activeFixtures > 0 && !busy;
  const flagged = (fixtures ?? []).filter((f) => !f.excluded && (f.confidence < LOW_CONFIDENCE || f.issues.length > 0)).length;

  async function confirm(fx: Fixture[] | null = fixtures, pl: FilterPlan | null = plan) {
    if (!fx || !pl) return;
    setBusy("confirm");
    setActionError(null);
    try {
      replace(await api.confirm(job!.id, fx, pl));
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not start the analysis.");
    } finally {
      setBusy(null);
    }
  }

  async function reinterpret() {
    setBusy("reinterpret");
    setActionError(null);
    try {
      const j = await api.reinterpret(job!.id, instruction.trim());
      replace(j);
      setPlan(null); // show the fresh server interpretation
      setInstruction(null);
      setEditingInstruction(false);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not interpret the instruction.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-10">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted transition-colors hover:text-fg">
            <ArrowLeft className="size-3.5" aria-hidden /> Workspace
          </Link>
          <h1 className="mt-3 font-display text-title font-bold uppercase">{awaiting ? "Review the read" : "Analysis"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[12px] text-muted">
          <span>Ref {job.id.slice(0, 8)}</span>
          <StatusBadge status={job.status} />
        </div>
      </header>

      {job.status === "FAILED" && (
        <Notice tone="danger" title="The analysis stopped">
          {job.error?.message ?? "Something went wrong."}
          <div className="mt-3 flex flex-wrap gap-2">
            {job.extraction && (
              <Button size="sm" variant="secondary" onClick={() => confirm(job.extraction!.fixtures, job.plan)} disabled={!job.plan || job.plan.status !== "ok"}>
                <RotateCcw className="size-3.5" /> Retry analysis
              </Button>
            )}
            <ButtonLink size="sm" variant="ghost" href="/dashboard">Start a new analysis</ButtonLink>
          </div>
        </Notice>
      )}

      <div className="grid gap-x-10 gap-y-12 lg:grid-cols-12">
        {/* Left: the source image and the live timeline */}
        <aside className="min-w-0 space-y-8 lg:sticky lg:top-20 lg:col-span-5 lg:self-start">
          <figure>
            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3 pb-3">
              <Kicker>Source</Kicker>
              <span className="font-mono text-[11px] text-faint tnum">
                {job.image.width} × {job.image.height} px
                {job.extraction ? ` · ${job.extraction.fixtures.length} rows` : ""}
                {job.extraction && job.extraction.tiles > 1 ? ` · ${job.extraction.tiles} sections` : ""}
              </span>
            </div>
            <div className="max-h-[68vh] overflow-auto border border-line bg-surface p-3">
              <ImageWithBoxes src={job.imageUrl} width={job.image.width} height={job.image.height} items={overlay} selectedId={selected} onSelect={setSelected} />
            </div>
          </figure>
          <section aria-label="Progress">
            <div className="flex items-baseline justify-between pb-1">
              <Kicker>Timeline</Kicker>
              <span className="font-mono text-[11px] text-faint">Updates live</span>
            </div>
            <ProgressSteps steps={job.steps} />
          </section>
        </aside>

        {/* Right: what the AI understood */}
        <div className="min-w-0 space-y-14 lg:col-span-7">
          <section>
            <SectionHead
              index="01"
              label="Instruction"
              title="What you asked"
              action={awaiting && !editingInstruction && !needsClarification ? <Button size="sm" variant="ghost" onClick={() => setEditingInstruction(true)}>Edit</Button> : undefined}
              className="mb-5"
            />
            {editingInstruction || needsClarification ? (
              <div className="space-y-4">
                {needsClarification && (
                  <Notice tone="warn" title="A question before continuing">
                    {plan?.clarificationQuestion}
                    <span className="mt-1 block text-[12px] text-muted">Rewrite your instruction below to answer it.</span>
                  </Notice>
                )}
                <InstructionBox id="instruction-edit" value={instruction} onChange={setInstruction} disabled={busy !== null} showExamples={false} />
                <div className="flex gap-2">
                  <Button onClick={reinterpret} loading={busy === "reinterpret"} disabled={instruction.trim().length < 3}>Interpret again</Button>
                  {editingInstruction && <Button variant="ghost" onClick={() => { setEditingInstruction(false); setInstruction(null); }}>Cancel</Button>}
                </div>
              </div>
            ) : (
              <blockquote className="border-l-2 border-line-strong pl-4 text-lg leading-snug text-fg/90">{job.instruction}</blockquote>
            )}
          </section>

          <section>
            <SectionHead index="02" label="Interpretation" title="The rules that will run" className="mb-5" />
            {job.status === "EXTRACTING" && !plan && (
              <div className="space-y-2">
                <div className="sweep h-[2px] bg-line" />
                <p className="font-mono text-[12px] text-muted">Interpreting your instruction</p>
              </div>
            )}
            {job.planError && !plan && <Notice tone="danger" title="Instruction not understood">{job.planError}</Notice>}
            {plan && plan.status === "ok" && <PlanEditor plan={plan} onChange={setPlan} disabled={!awaiting || busy !== null} />}
          </section>

          <section>
            <SectionHead
              index="03"
              label="Fixtures"
              title={awaiting ? "Check what was read" : "Fixtures in this analysis"}
              description={awaiting ? "Correct anything the AI misread. Flagged rows carry an amber edge." : undefined}
              action={awaiting && fixtures ? <span className="font-mono text-[12px] text-muted tnum">{activeFixtures} active{flagged ? ` · ${flagged} flagged` : ""}</span> : undefined}
              className="mb-5"
            />
            {job.status === "EXTRACTING" ? (
              <div className="space-y-3">
                <div className="sweep h-[2px] bg-line" />
                <p className="font-mono text-[12px] text-muted">Reading fixtures from your screenshot</p>
                <div className="space-y-px">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
              </div>
            ) : job.extraction && job.extraction.warnings.length > 0 && awaiting ? (
              <Notice tone="warn" className="mb-5" title="Notes from reading your screenshot">
                <ul className="space-y-0.5">{job.extraction.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </Notice>
            ) : null}

            {awaiting && fixtures && (
              <FixtureEditor fixtures={fixtures} onChange={setFixtures} imageHeight={job.image.height} imageWidth={job.image.width} selectedId={selected} onSelect={setSelected} disabled={busy !== null} />
            )}
            {!awaiting && job.extraction && job.status !== "EXTRACTING" && (
              <ul className="border-b border-line text-sm">
                {job.extraction.fixtures.map((f) => (
                  <li key={f.id} className="grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-3 border-t border-line py-2.5">
                    <span className="font-mono text-[12px] text-faint tnum">{f.id.slice(-2)}</span>
                    <span className="min-w-0 truncate">{f.excluded ? <span className="text-faint">Not a fixture</span> : <>{f.homeTeam} <span className="text-faint">v</span> {f.awayTeam}</>}</span>
                    <span className="font-mono text-[11px] text-faint">{f.competition ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {awaiting && (
            <section className="sticky bottom-0 z-20 -mx-[var(--gutter)] border-t border-line-strong bg-ink/95 px-[var(--gutter)] py-4 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
              {actionError && <Notice tone="danger" className="mb-3">{actionError}</Notice>}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[13px] text-muted">
                  {missingNames ? "Some fixtures are missing team names." : !plan ? "Waiting for a valid interpretation of your instruction." : needsClarification ? "Answer the question above first." : "Statistics are fetched only after you confirm."}
                </p>
                <Button size="lg" onClick={() => confirm()} disabled={!canConfirm} loading={busy === "confirm"}>
                  Confirm {activeFixtures} fixture{activeFixtures === 1 ? "" : "s"} <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
