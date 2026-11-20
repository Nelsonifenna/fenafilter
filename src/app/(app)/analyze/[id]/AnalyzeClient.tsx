"use client";

import { ArrowLeft, CheckCircle2, HelpCircle, ImageIcon, ListChecks, MessageSquareText, RotateCcw, ScanSearch, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FixtureEditor, LOW_CONFIDENCE } from "@/components/analysis/FixtureEditor";
import { ImageWithBoxes, type OverlayItem } from "@/components/analysis/ImageWithBoxes";
import { PlanEditor } from "@/components/analysis/PlanEditor";
import { ProgressSteps } from "@/components/analysis/ProgressSteps";
import { InstructionBox } from "@/components/dashboard/InstructionBox";
import { StatusBadge } from "@/components/StatusBadge";
import { Alert, Button, ButtonLink, Card, CardHeader, Skeleton } from "@/components/ui/primitives";
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
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <Alert tone="danger" title="Analysis unavailable">{error.message}</Alert>
        <ButtonLink href="/dashboard" variant="secondary"><ArrowLeft className="size-4" /> Back to dashboard</ButtonLink>
      </div>
    );
  }
  if (!job) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Skeleton className="h-[480px]" />
        <Skeleton className="h-[480px]" />
      </div>
    );
  }

  const awaiting = job.status === "AWAITING_CONFIRMATION";
  const needsClarification = plan?.status === "needs_clarification";
  const missingNames = (fixtures ?? []).some((f) => !f.excluded && (!f.homeTeam.trim() || !f.awayTeam.trim()));
  const activeFixtures = (fixtures ?? []).filter((f) => !f.excluded).length;
  const canConfirm = awaiting && fixtures && plan && plan.status === "ok" && !missingNames && activeFixtures > 0 && !busy;

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Dashboard</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Analysis workspace</h1>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {job.status === "FAILED" && (
        <Alert tone="danger" title="The analysis stopped">
          {job.error?.message ?? "Something went wrong."}
          <div className="mt-3 flex flex-wrap gap-2">
            {job.extraction && (
              <Button size="sm" variant="secondary" onClick={() => confirm(job.extraction!.fixtures, job.plan)} disabled={!job.plan || job.plan.status !== "ok"}>
                <RotateCcw className="size-3.5" /> Retry analysis
              </Button>
            )}
            <ButtonLink size="sm" variant="secondary" href="/dashboard">Start a new analysis</ButtonLink>
          </div>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Left: screenshot + progress */}
        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader icon={<ImageIcon className="size-4" />} title="Original screenshot" description={`${job.image.width}×${job.image.height}px${job.extraction ? ` · ${job.extraction.fixtures.length} fixture rows detected${job.extraction.tiles > 1 ? ` (read in ${job.extraction.tiles} sections)` : ""}` : ""}`} />
            <div className="max-h-[70vh] overflow-auto p-4">
              <ImageWithBoxes src={job.imageUrl} width={job.image.width} height={job.image.height} items={overlay} selectedId={selected} onSelect={setSelected} />
            </div>
          </Card>
          <Card>
            <CardHeader icon={<ScanSearch className="size-4" />} title="Progress" description="Live status from the server." />
            <div className="p-3"><ProgressSteps steps={job.steps} /></div>
          </Card>
        </div>

        {/* Right: review */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              icon={<MessageSquareText className="size-4" />}
              title="Your instruction"
              action={awaiting && !editingInstruction ? <Button size="sm" variant="ghost" onClick={() => setEditingInstruction(true)}>Edit</Button> : undefined}
            />
            <div className="space-y-4 p-5">
              {editingInstruction || needsClarification ? (
                <>
                  {needsClarification && (
                    <Alert tone="warn" title="The AI needs clarification">
                      <span className="flex items-start gap-2"><HelpCircle className="mt-0.5 size-4 shrink-0" />{plan?.clarificationQuestion}</span>
                      <span className="mt-1 block text-xs text-muted">Rewrite your instruction below to answer the question.</span>
                    </Alert>
                  )}
                  <InstructionBox id="instruction-edit" value={instruction} onChange={setInstruction} disabled={busy !== null} />
                  <div className="flex gap-2">
                    <Button onClick={reinterpret} loading={busy === "reinterpret"} disabled={instruction.trim().length < 3}><Sparkles className="size-4" /> Interpret again</Button>
                    {editingInstruction && <Button variant="ghost" onClick={() => { setEditingInstruction(false); setInstruction(null); }}>Cancel</Button>}
                  </div>
                </>
              ) : (
                <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm">“{job.instruction}”</p>
              )}

              {job.status === "EXTRACTING" && !plan && <Skeleton className="h-24" />}
              {job.planError && !plan && <Alert tone="danger" title="Instruction not understood">{job.planError}</Alert>}
              {plan && plan.status === "ok" && <PlanEditor plan={plan} onChange={setPlan} disabled={!awaiting || busy !== null} />}
            </div>
          </Card>

          <Card>
            <CardHeader icon={<ListChecks className="size-4" />} title="Extracted fixtures" description={awaiting ? "Check every fixture. Correct anything the AI misread before analysis starts." : "Fixtures used for this analysis."} />
            <div className="p-5">
              {job.status === "EXTRACTING" ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted">Reading fixtures from your screenshot…</p>
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
                </div>
              ) : job.extraction && job.extraction.warnings.length > 0 && awaiting ? (
                <Alert tone="warn" className="mb-4" title="Notes from the vision model">
                  <ul className="list-disc pl-5">{job.extraction.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                </Alert>
              ) : null}

              {awaiting && fixtures && (
                <FixtureEditor fixtures={fixtures} onChange={setFixtures} imageHeight={job.image.height} imageWidth={job.image.width} selectedId={selected} onSelect={setSelected} disabled={busy !== null} />
              )}
              {!awaiting && job.extraction && job.status !== "EXTRACTING" && (
                <ul className="divide-y divide-line text-sm">
                  {job.extraction.fixtures.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate">{f.excluded ? <span className="text-faint">Not a fixture</span> : `${f.homeTeam} vs ${f.awayTeam}`}</span>
                      <span className="shrink-0 text-xs text-faint">{f.competition ?? ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {awaiting && (
            <Card className="p-5">
              {actionError && <Alert tone="danger" className="mb-3">{actionError}</Alert>}
              <Button size="lg" className="w-full" onClick={() => confirm()} disabled={!canConfirm} loading={busy === "confirm"}>
                <CheckCircle2 className="size-4" /> Confirm & analyse {activeFixtures} fixture{activeFixtures === 1 ? "" : "s"}
              </Button>
              <p className="mt-2 text-center text-xs text-faint">
                {missingNames ? "Some fixtures are missing team names." : !plan ? "Waiting for a valid interpretation of your instruction." : needsClarification ? "Answer the clarification question first." : "Statistics are fetched only after you confirm."}
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
