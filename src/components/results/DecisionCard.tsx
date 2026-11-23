"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Decision, DecisionValue, Fixture } from "@/lib/domain/schemas";
import type { MatchDetailView, PublicFixtureStats } from "@/lib/jobs/view";
import { cn, Meter } from "../ui/primitives";
import { MatchDetails } from "./MatchDetails";

const DECISION: Record<DecisionValue, { label: string; cls: string }> = {
  KEEP: { label: "Keep", cls: "text-accent" },
  REMOVE: { label: "Remove", cls: "text-danger" },
  NEEDS_REVIEW: { label: "Review", cls: "text-warn" },
};

const CMP: Record<string, string> = { ">=": "≥", "<=": "≤" };

const SOURCE: Record<string, string> = {
  historical_match_data: "Historical",
  model_estimate: "Estimate",
  screenshot_text: "Screenshot",
};

/** One fixture's decision, rendered as a row on a team sheet. */
export function DecisionRow({
  fixture,
  decision,
  chosen,
  onChoose,
  stats,
  detail,
  onPickTeam,
  selected,
  onSelect,
}: {
  fixture: Fixture;
  decision: Decision;
  chosen: DecisionValue;
  onChoose: (v: DecisionValue) => void;
  stats?: PublicFixtureStats;
  detail?: MatchDetailView;
  onPickTeam?: (side: "home" | "away", teamId: number) => void;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const d = DECISION[chosen];
  const changed = chosen !== decision.engineDecision;

  return (
    <article id={`card-${fixture.id}`} className="row-state min-w-0 border-t border-line py-5 pr-1 pl-5 transition-colors" data-state={chosen} data-selected={selected} onClick={onSelect}>
      <header className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-faint">
            <span className="tnum">{fixture.id.slice(-2)}</span>
            {fixture.competition ? ` · ${fixture.competition}` : ""}
            {fixture.date ? ` · ${fixture.date}` : ""}
          </p>
          <h3 className={cn("mt-1 text-[17px] font-semibold leading-snug", chosen === "REMOVE" && "text-fg/60 line-through decoration-danger/60 decoration-1")}>
            {fixture.homeTeam} <span className="font-normal text-faint">v</span> {fixture.awayTeam}
          </h3>
        </div>
        <p className="text-right">
          <span className={cn("font-display text-xl font-semibold uppercase transition-colors", d.cls)}>{d.label}</span>
          {changed && <span className="block font-mono text-[10px] text-faint">changed by you</span>}
        </p>
      </header>

      <p className="mt-2 max-w-prose text-sm text-fg/80">{decision.reason}</p>

      {decision.evidence.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="kicker text-left">
                <th className="pb-1.5 font-normal" scope="col">Evidence</th>
                <th className="pb-1.5 text-right font-normal" scope="col">Value</th>
                <th className="pb-1.5 text-right font-normal" scope="col">Rule</th>
                <th className="pb-1.5 pl-4 text-right font-normal" scope="col">Type</th>
              </tr>
            </thead>
            <tbody>
              {decision.evidence.map((e, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-2 pr-3">
                    <span className="text-fg/90">{e.label}</span>
                    <span className="block text-[11px] text-faint">
                      {e.subject}
                      {e.sampleSize !== null ? ` · ${e.sampleSize} matches` : ""}
                    </span>
                  </td>
                  <td className={cn("py-2 pr-3 text-right font-mono tnum", e.passed === true ? "text-fg" : e.passed === false ? "text-muted" : "text-warn")}>{e.display}</td>
                  <td className="py-2 text-right font-mono text-muted tnum">
                    {e.comparator && e.threshold !== null ? `${CMP[e.comparator] ?? e.comparator} ${e.metric.includes("probability") || e.metric.includes("rate") ? `${Math.round(e.threshold * 100)}%` : e.threshold}` : "—"}
                  </td>
                  <td className={cn("py-2 pl-4 text-right font-mono text-[11px]", e.source === "model_estimate" ? "text-fg/80" : "text-faint")}>{SOURCE[e.source] ?? e.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {decision.missingData.length > 0 && (
        <ul className="mt-3 space-y-1 border-l-2 border-warn pl-3">
          {decision.missingData.map((m) => <li key={m} className="text-[12px] text-warn">{m}</li>)}
        </ul>
      )}

      {onPickTeam && stats &&
        (["home", "away"] as const).map((side) => {
          const r = stats[side].resolution;
          if (r.status !== "ambiguous" || r.candidates.length === 0) return null;
          return (
            <div key={side} className="mt-4">
              <p className="text-[13px] text-warn">Which club is “{r.query}”? Choosing one reruns the analysis.</p>
              <div className="mt-2 flex flex-wrap gap-px bg-line p-px">
                {r.candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onPickTeam(side, c.id); }}
                    className="bg-ink px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-2"
                  >
                    {c.name}
                    {c.country && <span className="ml-2 font-mono text-[11px] text-faint">{c.country}</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

      <footer className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex border border-line-strong" role="radiogroup" aria-label={`Decision for ${fixture.homeTeam} v ${fixture.awayTeam}`}>
          {(["KEEP", "REMOVE"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={chosen === v}
              onClick={(e) => { e.stopPropagation(); onChoose(v); }}
              className={cn(
                "px-3.5 py-1.5 text-[12px] font-semibold transition-colors active:translate-y-px",
                chosen === v ? (v === "KEEP" ? "bg-accent text-accent-ink" : "bg-danger text-ink") : "text-muted hover:text-fg",
              )}
            >
              {v === "KEEP" ? "Keep" : "Remove"}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-2 text-[11px] text-faint" title="How complete the data behind this decision is. It is not the probability of any match outcome.">
          Data completeness <Meter value={decision.confidence} label="data completeness" />
        </span>
        <button
          type="button"
          className="ml-auto flex items-center gap-1 font-mono text-[12px] text-muted transition-colors hover:text-fg"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          aria-expanded={open}
          aria-controls={`details-${fixture.id}`}
        >
          Match details <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </button>
      </footer>

      <div id={`details-${fixture.id}`} className="reveal" data-open={open}>
        <div inert={!open}>
          <div className="mt-5 border-t border-dashed border-line-strong pt-5" onClick={(e) => e.stopPropagation()}>
            <MatchDetails detail={detail} stats={stats} />
          </div>
        </div>
      </div>
    </article>
  );
}
