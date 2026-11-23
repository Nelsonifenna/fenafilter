"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { jobHref, StatusBadge } from "@/components/StatusBadge";
import { Button, ButtonLink, Kicker, Notice, Skeleton } from "@/components/ui/primitives";
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
    <div className="space-y-10">
      <header className="animate-rise grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <Kicker>Session</Kicker>
          <h1 className="mt-3 font-display text-title font-bold uppercase">History</h1>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 lg:col-span-5">
          <p className="max-w-xs text-sm text-muted">Analyses from this browser session. Each one is deleted automatically after 24 hours.</p>
          <ButtonLink href="/dashboard">New analysis</ButtonLink>
        </div>
      </header>

      {error && <Notice tone="danger">{error}</Notice>}

      {items === null ? (
        <div className="space-y-px">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : items.length === 0 ? (
        <section className="grid gap-6 border-t border-line pt-8 lg:grid-cols-12">
          <p className="font-display text-section font-semibold uppercase text-muted lg:col-span-5">No analyses yet</p>
          <div className="lg:col-span-6 lg:col-start-7">
            <p className="text-sm text-muted">Load a screenshot in the workspace. Finished and in-progress analyses appear here until they expire.</p>
            <ButtonLink href="/dashboard" variant="secondary" className="mt-4">Open the workspace</ButtonLink>
          </div>
        </section>
      ) : (
        <div>
          <div className="kicker hidden grid-cols-[5rem_9rem_1fr_repeat(4,3.5rem)_10rem_2.5rem] gap-4 pb-2 lg:grid" aria-hidden>
            <span />
            <span>Date</span>
            <span>Instruction</span>
            <span className="text-right">Read</span>
            <span className="text-right">Kept</span>
            <span className="text-right">Out</span>
            <span className="text-right">Rev</span>
            <span>Status</span>
            <span />
          </div>
          <ul className="border-b border-line">
            {items.map((j) => {
              const done = j.status === "COMPLETED";
              return (
                <li key={j.id} className="group grid grid-cols-[4rem_1fr_auto] items-center gap-x-4 gap-y-2 border-t border-line py-3 transition-colors hover:bg-surface lg:grid-cols-[5rem_9rem_1fr_repeat(4,3.5rem)_10rem_2.5rem]">
                  <Link href={jobHref(j.id, j.status)} className="row-span-2 block lg:row-span-1" tabIndex={-1} aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, session-authenticated image route */}
                    <img src={j.thumbnailUrl} alt="" loading="lazy" className="h-14 w-full border border-line object-cover object-top grayscale transition-[filter] group-hover:grayscale-0" />
                  </Link>
                  <span className="font-mono text-[12px] text-faint tnum lg:order-none">{new Date(j.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                  <Button variant="ghost" size="sm" className="justify-self-end px-2 text-faint hover:text-danger lg:order-last" onClick={() => remove(j.id)} loading={deleting === j.id} aria-label="Delete analysis">
                    {deleting !== j.id && <Trash2 className="size-3.5" />}
                  </Button>
                  <Link href={jobHref(j.id, j.status)} className="col-span-2 min-w-0 lg:col-span-1">
                    <span className="block truncate text-sm text-fg/90 transition-colors group-hover:text-fg">{j.instruction}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 lg:hidden">
                      <StatusBadge status={j.status} />
                      <span className="font-mono text-[11px] text-muted tnum">
                        {j.fixtures} read{done ? ` · ${j.kept} kept · ${j.removed} out · ${j.review} review` : ""}
                      </span>
                    </span>
                  </Link>
                  <span className="hidden text-right font-mono text-[13px] tnum lg:block">{j.fixtures}</span>
                  <span className="hidden text-right font-mono text-[13px] text-accent tnum lg:block">{done ? j.kept : "—"}</span>
                  <span className="hidden text-right font-mono text-[13px] text-danger tnum lg:block">{done ? j.removed : "—"}</span>
                  <span className="hidden text-right font-mono text-[13px] text-warn tnum lg:block">{done ? j.review : "—"}</span>
                  <span className="hidden lg:block"><StatusBadge status={j.status} /></span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
