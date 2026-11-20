"use client";

import { ArrowRight, FilePlus2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { jobHref, StatusBadge } from "@/components/StatusBadge";
import { Alert, Button, ButtonLink, Card, Skeleton } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";
import type { JobSummaryView } from "@/lib/jobs/view";

export function HistoryClient() {
  const [items, setItems] = useState<JobSummaryView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    api.history().then((h) => setItems(h.items)).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load history."));
  }, []);

  async function remove(id: string) {
    if (!window.confirm("Delete this analysis and its images? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await api.deleteJob(id);
      setItems((cur) => cur?.filter((i) => i.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analysis history</h1>
          <p className="mt-1 text-sm text-muted">Analyses from this browser session. They are deleted automatically after 24 hours.</p>
        </div>
        <ButtonLink href="/dashboard"><FilePlus2 className="size-4" /> New analysis</ButtonLink>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {items === null ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : items.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <p className="font-medium">No analyses yet</p>
          <p className="mt-1 text-sm text-muted">Upload a screenshot on the dashboard to get started.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((j) => (
            <li key={j.id}>
              <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <Link href={jobHref(j.id, j.status)} className="block shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, session-authenticated image route */}
                  <img src={j.thumbnailUrl} alt="" loading="lazy" className="h-20 w-full rounded-lg border border-line object-cover object-top sm:w-28" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={j.status} />
                    <span className="text-xs text-faint">{new Date(j.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm">“{j.instruction}”</p>
                  <p className="mt-1 text-xs text-muted">
                    {j.fixtures} fixtures{j.status === "COMPLETED" ? ` · ${j.kept} kept · ${j.removed} removed · ${j.review} to review` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <ButtonLink href={jobHref(j.id, j.status)} variant="secondary" size="sm">Open <ArrowRight className="size-3.5" /></ButtonLink>
                  <Button variant="danger" size="sm" onClick={() => remove(j.id)} loading={deleting === j.id} aria-label="Delete analysis"><Trash2 className="size-3.5" /></Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
