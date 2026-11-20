"use client";

import { ArrowRight, Clock, Eraser, ImageIcon, MessageSquareText, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { InstructionBox } from "@/components/dashboard/InstructionBox";
import { Dropzone } from "@/components/dashboard/Dropzone";
import { ServiceNotice } from "@/components/ServiceNotice";
import { jobHref, StatusBadge } from "@/components/StatusBadge";
import { Alert, Button, Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import { api, ApiError, type SessionInfo } from "@/lib/client/api";
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

  useEffect(() => {
    api.session().then(setSession).catch(() => setPhase({ kind: "error", message: "Could not start a session. Please refresh the page." }));
    api.history().then((h) => setRecent(h.items.slice(0, 4))).catch(() => setRecent([]));
  }, []);

  const busy = phase.kind === "uploading" || phase.kind === "starting";
  const canSubmit = Boolean(file && instruction.trim().length >= 3 && session && !busy);

  async function analyse() {
    if (!file || !session) return;
    try {
      setPhase({ kind: "uploading", pct: 0 });
      const imageKey = await uploadImage(file, session, (pct) => setPhase({ kind: "uploading", pct }));
      setPhase({ kind: "starting" });
      const { id } = await api.startAnalysis({ imageKey, instruction: instruction.trim(), originalName: file.name });
      router.push(`/analyze/${id}`);
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof ApiError ? e.message : "Upload failed. Please try again." });
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome to your workspace</h1>
        <p className="mt-1 text-muted">Upload a football screenshot, describe what to filter, and review the result before downloading.</p>
      </section>

      <ServiceNotice services={session?.services ?? null} />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader icon={<ImageIcon className="size-4" />} title="1. Upload screenshot" description="Fixtures list, betting slip or bookmaker screenshot." />
          <div className="p-5">
            <Dropzone file={file} onChange={setFile} disabled={busy} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={<MessageSquareText className="size-4" />} title="2. Your instruction" description="Plain English — any rules you like." />
            <div className="p-5">
              <InstructionBox value={instruction} onChange={setInstruction} disabled={busy} />
            </div>
          </Card>

          <Card className="p-5">
            <Button size="lg" className="w-full" onClick={analyse} disabled={!canSubmit} loading={busy}>
              {phase.kind === "uploading" ? `Uploading… ${Math.round(phase.pct)}%` : phase.kind === "starting" ? "Starting analysis…" : (<><ScanSearch className="size-4" aria-hidden /> Analyse screenshot</>)}
            </Button>
            {!file && <p className="mt-2 text-center text-xs text-faint">Add a screenshot to continue.</p>}
            {file && instruction.trim().length < 3 && <p className="mt-2 text-center text-xs text-faint">Write an instruction to continue.</p>}
            {phase.kind === "error" && <Alert tone="danger" className="mt-3">{phase.message}</Alert>}
            <div className="mt-4 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || (!file && !instruction)}
                onClick={() => {
                  setFile(null);
                  setInstruction("");
                  setPhase({ kind: "idle" });
                  router.replace("/dashboard");
                }}
              >
                <Eraser className="size-3.5" aria-hidden /> Clear workspace
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold"><Clock className="size-4 text-accent" aria-hidden /> Previous analyses</h2>
          <Link href="/history" className="text-sm text-accent hover:text-accent-strong">View all</Link>
        </div>
        {recent === null ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">No analyses yet. Your recent work will appear here for 24 hours.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((j) => (
              <Link key={j.id} href={jobHref(j.id, j.status)} className="group rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/40">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={j.status} />
                  <ArrowRight className="size-4 text-faint group-hover:text-accent" aria-hidden />
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-fg/90">“{j.instruction}”</p>
                <p className="mt-2 text-xs text-faint">{new Date(j.createdAt).toLocaleString()} · {j.fixtures} fixtures</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
