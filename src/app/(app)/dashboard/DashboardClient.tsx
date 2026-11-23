"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Dropzone } from "@/components/dashboard/Dropzone";
import { InstructionBox } from "@/components/dashboard/InstructionBox";
import { ServiceNotice } from "@/components/ServiceNotice";
import { jobHref, StatusBadge } from "@/components/StatusBadge";
import { Button, Kicker, Notice, SectionHead, Skeleton } from "@/components/ui/primitives";
import { api, ApiError, type SessionInfo } from "@/lib/client/api";
import { deletePlaybook, loadPlaybooks, type Playbook } from "@/lib/client/playbooks";
import { uploadImage } from "@/lib/client/upload";
import type { JobSummaryView } from "@/lib/jobs/view";

type Phase = { kind: "idle" } | { kind: "uploading"; pct: number } | { kind: "starting" } | { kind: "error"; message: string };

export function DashboardClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [instruction, setInstruction] = useState(() => params.get("instruction")?.slice(0, 1500) ?? "");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [recent, setRecent] = useState<JobSummaryView[] | null>(null);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [activePlaybook, setActivePlaybook] = useState<Playbook | null>(null);

  useEffect(() => {
    api.session().then(setSession).catch(() => setPhase({ kind: "error", message: "Could not start a session. Please refresh the page." }));
    api.history().then((h) => setRecent(h.items.slice(0, 5))).catch(() => setRecent([]));
    // Saved playbooks live in this browser only; read after hydration.
    void Promise.resolve().then(() => setPlaybooks(loadPlaybooks()));
  }, []);

  // A saved playbook stays active only while its instruction is unchanged.
  const usingPlaybook = activePlaybook && activePlaybook.instruction === instruction ? activePlaybook : null;

  const busy = phase.kind === "uploading" || phase.kind === "starting";
  const canSubmit = Boolean(file && instruction.trim().length >= 3 && session && !busy);

  async function analyse() {
    if (!file || !session) return;
    try {
      setPhase({ kind: "uploading", pct: 0 });
      const imageKey = await uploadImage(file, session, (pct) => setPhase({ kind: "uploading", pct }));
      setPhase({ kind: "starting" });
      const { id } = await api.startAnalysis({ imageKey, instruction: instruction.trim(), originalName: file.name, plan: usingPlaybook?.plan });
      // Straight to results: progress shows there and the pipeline runs on its own.
      router.push(`/results/${id}`);
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof ApiError ? e.message : "Upload failed. Please try again." });
    }
  }

  const hint = !file
    ? "Load a screenshot to continue."
    : instruction.trim().length < 3
      ? "Write an instruction or choose a saved playbook."
      : usingPlaybook
        ? `Runs “${usingPlaybook.name}” automatically, from reading the matches to the filtered image.`
        : "Runs automatically, from reading the matches to the filtered image. You only step in if something is unclear.";

  return (
    <div className="space-y-14">
      <header className="animate-rise grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <Kicker>Workspace</Kicker>
          <h1 className="mt-3 font-display text-title font-bold uppercase">New analysis</h1>
        </div>
        <p className="max-w-md text-sm text-muted lg:col-span-4 lg:col-start-9">
          Load a football screenshot, describe what to filter, and review the result before downloading.
        </p>
      </header>

      <ServiceNotice availability={session?.availability ?? null} />

      <div className="grid gap-x-10 gap-y-14 lg:grid-cols-12">
        <section className="min-w-0 lg:col-span-7" aria-labelledby="stage-title">
          <SectionHead index="01" label="Screenshot" title={<span id="stage-title">Load the fixture list</span>} className="mb-6" />
          <Dropzone file={file} onChange={setFile} disabled={busy} progress={phase.kind === "uploading" ? phase.pct : null} processing={phase.kind === "starting"} />
        </section>

        <div className="min-w-0 space-y-12 lg:col-span-5">
          <section aria-labelledby="instr-title">
            <SectionHead index="02" label="Instruction" title={<span id="instr-title">Tell it what to filter</span>} className="mb-6" />
            <InstructionBox value={instruction} onChange={setInstruction} disabled={busy} />
            {playbooks.length > 0 && (
              <div className="mt-6">
                <p className="kicker">Saved playbooks</p>
                <ul className="mt-2 border-b border-line">
                  {playbooks.map((pb) => {
                    const active = usingPlaybook?.id === pb.id;
                    return (
                      <li key={pb.id} className={`row-state grid grid-cols-[1fr_auto] items-center gap-3 border-t border-line py-2.5 pl-3`} data-selected={active}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => { setInstruction(pb.instruction); setActivePlaybook(pb); }}
                          className="min-w-0 text-left"
                          aria-pressed={active}
                        >
                          <span className="block truncate text-[13px] font-medium">{pb.name}</span>
                          <span className="block truncate text-[12px] text-muted">{pb.plan.summary}</span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => { setPlaybooks(deletePlaybook(pb.id)); if (active) setActivePlaybook(null); }}
                          className="px-2 font-mono text-[11px] text-faint transition-colors hover:text-danger"
                          aria-label={`Delete playbook ${pb.name}`}
                        >
                          Delete
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {usingPlaybook && (
                  <p className="mt-2 text-[12px] text-muted">
                    The saved rules of <span className="text-fg">{usingPlaybook.name}</span> will run as they are. Edit the instruction to have it interpreted again.
                  </p>
                )}
              </div>
            )}
          </section>

          <section aria-labelledby="run-title">
            <SectionHead index="03" label="Run" title={<span id="run-title">Analyze and filter</span>} className="mb-6" />
            <Button size="lg" className="w-full" onClick={analyse} disabled={!canSubmit} loading={busy}>
              {phase.kind === "uploading" ? `Uploading ${Math.round(phase.pct)}%` : phase.kind === "starting" ? "Starting analysis" : (<>Analyze and Filter <ArrowRight className="size-4" aria-hidden /></>)}
            </Button>
            <p className="mt-3 text-[13px] text-muted">{hint}</p>
            {phase.kind === "error" && <Notice tone="danger" className="mt-4">{phase.message}</Notice>}
            <button
              type="button"
              className="mt-5 font-mono text-[12px] text-faint transition-colors hover:text-fg disabled:opacity-40"
              disabled={busy || (!file && !instruction)}
              onClick={() => {
                setFile(null);
                setInstruction("");
                setPhase({ kind: "idle" });
                router.replace("/dashboard");
              }}
            >
              Clear workspace
            </button>
          </section>
        </div>
      </div>

      <section aria-labelledby="recent-title">
        <SectionHead
          label="Session"
          title={<span id="recent-title">Recent analyses</span>}
          action={<Link href="/history" className="link text-sm">All history</Link>}
        />
        {recent === null ? (
          <div className="mt-4 space-y-px">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : recent.length === 0 ? (
          <p className="mt-6 max-w-md text-sm text-muted">Nothing yet. Analyses from this browser appear here for 24 hours.</p>
        ) : (
          <ul className="mt-4 border-b border-line">
            {recent.map((j) => (
              <li key={j.id}>
                <Link
                  href={jobHref(j.id, j.status)}
                  className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 border-t border-line py-3.5 transition-colors hover:bg-surface sm:grid-cols-[9rem_1fr_6rem_11rem_1rem]"
                >
                  <span className="font-mono text-[12px] text-faint tnum">{new Date(j.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                  <ArrowRight className="size-4 justify-self-end text-faint transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-accent sm:order-last" aria-hidden />
                  <span className="col-span-2 truncate text-sm text-fg/90 sm:col-span-1">{j.instruction}</span>
                  <span className="font-mono text-[12px] text-muted tnum">{j.fixtures} fixtures</span>
                  <span className="justify-self-end sm:justify-self-start"><StatusBadge status={j.status} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
