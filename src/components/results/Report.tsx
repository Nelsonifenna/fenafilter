"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button, cn, inputClass, Notice } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";
import type { Decision, DecisionValue, Fixture } from "@/lib/domain/schemas";
import { explainDecision } from "@/lib/explain";
import { formatMetricValue } from "@/lib/filtering/metrics";
import type { JobView, MatchDetailView, PublicFixtureStats } from "@/lib/jobs/view";
import { MatchDetails } from "./MatchDetails";
import { findProblems } from "./RunStates";

const WORD: Record<DecisionValue, { label: string; cls: string; dot: string }> = {
  KEEP: { label: "Kept", cls: "text-accent", dot: "bg-accent" },
  REMOVE: { label: "Removed", cls: "text-danger", dot: "bg-danger" },
  NEEDS_REVIEW: { label: "Needs a look", cls: "text-warn", dot: "bg-warn" },
};
const CMP: Record<string, string> = { ">=": "≥", "<=": "≤", ">": ">", "<": "<" };
const SOURCE: Record<string, string> = { historical_match_data: "Historical record", model_estimate: "Model estimate", screenshot_text: "From your screenshot" };

/* ------------------------------------------------------------------ */
/* One match, written as a short answer with evidence on demand.       */
/* ------------------------------------------------------------------ */

export function MatchItem({
  fixture,
  decision,
  chosen,
  onChoose,
  plan,
  league,
  stats,
  detail,
  children,
}: {
  fixture: Fixture;
  decision: Decision;
  chosen: DecisionValue;
  onChoose: (v: DecisionValue) => void;
  plan: JobView["plan"];
  league: string | null;
  stats?: PublicFixtureStats;
  detail?: MatchDetailView;
  /** Extra content under the explanation (e.g. correction controls). */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const w = WORD[chosen];
  // Only team-form figures can be out of date; head-to-head and league figures carry their own dates/seasons.
  const asOf = decision.evidence
    .filter((e) => !e.metric.startsWith("h2h_") && !e.metric.startsWith("league_"))
    .map((e) => e.asOf)
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(-1);
  const stale = stats && (stats.home.stale || stats.away.stale);

  return (
    <article id={`card-${fixture.id}`} className="scroll-mt-24 py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold leading-snug break-words sm:text-lg">
            {fixture.homeTeam || "Unreadable team"} <span className="font-normal text-faint">v</span> {fixture.awayTeam || "Unreadable team"}
          </h3>
          {(league || fixture.date || fixture.kickoff) && (
            <p className="mt-1 text-[13px] text-muted">{[league, [fixture.date, fixture.kickoff].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <span className={cn("mt-1 inline-flex shrink-0 items-center gap-2 text-[13px] font-medium", w.cls)}>
          <span className={cn("size-1.5", w.dot)} aria-hidden />
          {w.label}
        </span>
      </div>

      <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-fg/85">{explainDecision(decision, plan, chosen)}</p>
      {stale && asOf && (
        <p className="mt-1.5 text-[13px] text-muted">Based on matches up to {new Date(asOf).toLocaleDateString(undefined, { month: "long", year: "numeric" })}, so recent form may differ.</p>
      )}

      {children}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={`evidence-${fixture.id}`}
          className="inline-flex min-h-10 items-center gap-1.5 text-[14px] text-fg/90 underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-accent"
        >
          {open ? "Hide statistical evidence" : "See statistical evidence"}
          <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </button>
        <div className="ml-auto flex" role="radiogroup" aria-label={`Decision for ${fixture.homeTeam} v ${fixture.awayTeam}`}>
          {(["KEEP", "REMOVE"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={chosen === v}
              onClick={() => onChoose(v)}
              className={cn(
                "min-h-10 border border-line-strong px-4 text-[13px] font-medium transition-colors first:border-r-0 active:translate-y-px",
                chosen === v ? (v === "KEEP" ? "border-accent bg-accent text-accent-ink" : "border-danger bg-danger text-ink") : "text-muted hover:text-fg",
              )}
            >
              {v === "KEEP" ? "Keep" : "Remove"}
            </button>
          ))}
        </div>
      </div>

      <div id={`evidence-${fixture.id}`} className="reveal" data-open={open}>
        <div inert={!open}>
          <div className="mt-5 border-l-2 border-line-strong pl-4">
            <EvidencePanel decision={decision} stats={stats} detail={detail} />
          </div>
        </div>
      </div>
    </article>
  );
}

/** Full evidence: criteria, figures with sample/window/date, then the detailed match comparison. */
function EvidencePanel({ decision, stats, detail }: { decision: Decision; stats?: PublicFixtureStats; detail?: MatchDetailView }) {
  return (
    <div className="space-y-6">
      {decision.checks && decision.checks.length > 0 && (
        <section>
          <h4 className="kicker">Your criteria</h4>
          <ul className="mt-2 space-y-1.5">
            {decision.checks.map((c, i) => (
              <li key={i} className="text-[14px] leading-snug">
                <span className={cn("mr-2 font-mono text-[12px]", c.result === "met" ? (c.rule === "remove" ? "text-danger" : "text-accent") : c.result === "unknown" ? "text-warn" : "text-faint")}>
                  {c.result === "met" ? "Met" : c.result === "unknown" ? "No data" : "Not met"}
                </span>
                <span className="text-muted">{c.rule === "remove" ? "Remove if " : "Keep if "}</span>
                {c.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {decision.evidence.length > 0 && (
        <section>
          <h4 className="kicker">Figures behind the decision</h4>
          <ul className="mt-2">
            {decision.evidence.map((e, i) => (
              <li key={i} className="border-t border-line py-2.5 first:border-t-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px]">
                    {e.label}
                    {e.subject !== "match" && <span className="text-muted"> · {e.subject.replace(/^(home|away): /, "")}</span>}
                  </span>
                  <span className={cn("shrink-0 font-mono text-[14px] tnum", e.passed === null ? "text-warn" : "text-fg")}>{e.display}</span>
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                  {[
                    SOURCE[e.source],
                    e.comparator && e.threshold !== null ? `your rule ${CMP[e.comparator] ?? e.comparator} ${formatMetricValue(e.metric, e.threshold)}` : null,
                    e.basis,
                    e.sampleSize !== null && e.source !== "model_estimate" ? `${e.sampleSize} ${e.basis?.includes("meeting") ? "meetings" : "matches"}` : null,
                    e.asOf ? `latest ${e.asOf.slice(0, 10)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {decision.missingData.length > 0 && (
        <section>
          <h4 className="kicker">Missing or limited data</h4>
          <ul className="mt-2 space-y-1 text-[14px] text-warn">{decision.missingData.map((m) => <li key={m}>{m}</li>)}</ul>
        </section>
      )}

      {stats && (
        <section>
          <h4 className="kicker mb-3">Match detail</h4>
          <MatchDetails detail={detail} stats={stats} />
        </section>
      )}

      <p className="text-[12px] text-faint">
        Data completeness {Math.round(decision.confidence * 100)}%. This describes how much of the needed data was available, not how likely any result is.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Needs review: plain reason + compact fixes, only where possible.     */
/* ------------------------------------------------------------------ */

type Edit = { homeTeam?: string; awayTeam?: string; home?: number; away?: number; excluded?: boolean };

/** Correction state for the review section: inline controls per problem match + one re-check button. */
export function useReviewFixes(job: JobView, onUpdate: (j: JobView) => void, onConflict: () => void) {
  const problems = findProblems(job);
  const byId = new Map(problems.map((p) => [p.fixture.id, p]));
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (id: string, patch: Edit) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const changed = Object.keys(edits).length > 0;

  async function rerun() {
    if (!job.plan || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fixtures = job.extraction!.fixtures.map((f) => {
        const e = edits[f.id];
        if (!e) return f;
        const renamed = e.homeTeam !== undefined || e.awayTeam !== undefined;
        return {
          ...f,
          homeTeam: e.homeTeam ?? f.homeTeam,
          awayTeam: e.awayTeam ?? f.awayTeam,
          issues: renamed ? f.issues.filter((i) => !/could not be read|unreadable/i.test(i)) : f.issues,
          excluded: e.excluded ?? f.excluded,
          userEdited: true,
          teamIds: { home: e.home ?? f.teamIds?.home ?? null, away: e.away ?? f.teamIds?.away ?? null },
        };
      });
      onUpdate(await api.confirm(job.id, fixtures, job.plan));
      setEdits({});
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) onConflict(); // already updating: just refresh
      else setError(e instanceof ApiError ? e.message : "The corrections could not be applied.");
    } finally {
      setBusy(false);
    }
  }

  function controls(fixtureId: string) {
    const p = byId.get(fixtureId);
    if (!p) return null;
    const e = edits[fixtureId] ?? {};
    const nameSides = (["home", "away"] as const).filter((side) => p.unreadable || p.sides.some((s) => s.side === side && s.status === "not_found"));
    const choose = p.sides.filter((s) => s.status === "ambiguous" && s.candidates.length > 0);
    return (
      <div className="mt-4 space-y-3">
        {!e.excluded && nameSides.length > 0 && (
          <div>
            <p className="text-[14px] text-fg/90">{p.unreadable ? "Type the team names as they appear:" : "Check the spelling of the team name:"}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {nameSides.map((side) => {
                const key = side === "home" ? "homeTeam" : "awayTeam";
                return (
                  <input
                    key={side}
                    aria-label={`${side} team name`}
                    className={cn(inputClass, "h-11 text-[15px]")}
                    placeholder={side === "home" ? "Home team" : "Away team"}
                    value={e[key] ?? p.fixture[key]}
                    onChange={(ev) => set(fixtureId, { [key]: ev.target.value.slice(0, 80) })}
                  />
                );
              })}
            </div>
          </div>
        )}
        {!e.excluded &&
          choose.map((s) => (
            <div key={s.side}>
              <p className="text-[14px] text-fg/90">Which club is “{s.query}”?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {s.candidates.map((c) => {
                  const picked = e[s.side] === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => set(fixtureId, { [s.side]: c.id })}
                      aria-pressed={picked}
                      className={cn("min-h-10 border px-3 text-left text-[14px] transition-colors", picked ? "border-accent bg-accent text-accent-ink" : "border-line-strong hover:border-fg")}
                    >
                      {c.name}
                      {c.country && <span className={cn("ml-2 text-[12px]", picked ? "text-accent-ink/70" : "text-faint")}>{c.country}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        <label className="inline-flex min-h-10 items-center gap-2 text-[14px] text-muted">
          <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={e.excluded ?? false} onChange={(ev) => set(fixtureId, { excluded: ev.target.checked })} />
          This row is not a match
        </label>
      </div>
    );
  }

  const footer =
    problems.length > 0 ? (
      <div className="mt-2 space-y-3">
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={rerun} loading={busy} disabled={!changed || busy}>
            Re-check corrected matches
          </Button>
          <span className="text-[13px] text-muted">Only the matches you corrected are checked again.</span>
        </div>
      </div>
    ) : null;

  return { controls, footer, hasFixes: problems.length > 0 };
}
