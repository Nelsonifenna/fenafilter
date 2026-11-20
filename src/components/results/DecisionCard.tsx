"use client";

import { AlertTriangle, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Decision, DecisionValue, Fixture, FixtureStats } from "@/lib/domain/schemas";
import type { MatchDetailView } from "@/lib/jobs/view";
import { Badge, Button, cn } from "../ui/primitives";
import { MatchDetails } from "./MatchDetails";

const DECISION: Record<DecisionValue, { label: string; tone: "accent" | "danger" | "warn" }> = {
  KEEP: { label: "Keep", tone: "accent" },
  REMOVE: { label: "Remove", tone: "danger" },
  NEEDS_REVIEW: { label: "Needs review", tone: "warn" },
};

const SOURCE: Record<string, { label: string; tone: "neutral" | "info" }> = {
  historical_match_data: { label: "Historical", tone: "neutral" },
  model_estimate: { label: "Estimate", tone: "info" },
  screenshot_text: { label: "Screenshot", tone: "neutral" },
};

export function DecisionCard({
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
  stats?: FixtureStats;
  detail?: MatchDetailView;
  onPickTeam?: (side: "home" | "away", teamId: number) => void;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const d = DECISION[chosen];
  const changed = chosen !== decision.engineDecision;

  return (
    <div id={`card-${fixture.id}`} className={cn("rounded-xl border bg-surface p-4", selected ? "border-accent/60" : "border-line")} onClick={onSelect}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {fixture.homeTeam} <span className="text-faint">vs</span> {fixture.awayTeam}
          </p>
          <p className="mt-0.5 text-xs text-faint">
            {fixture.id.replace("match_", "#")}
            {fixture.competition ? ` · ${fixture.competition}` : ""}
            {fixture.date ? ` · ${fixture.date}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={d.tone}>{d.label}</Badge>
          {changed && <Badge tone="neutral">Changed by you</Badge>}
        </div>
      </div>

      <p className="mt-3 text-sm text-fg/90">{decision.reason}</p>

      {decision.evidence.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-faint">
                <th className="py-1 pr-3 text-left font-normal" scope="col">Evidence</th>
                <th className="py-1 pr-3 text-right font-normal" scope="col">Value</th>
                <th className="py-1 pr-3 text-right font-normal" scope="col">Rule</th>
                <th className="py-1 text-right font-normal" scope="col">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {decision.evidence.map((e, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-3">
                    <span className="text-fg/90">{e.label}</span>
                    <span className="block text-faint">{e.subject}{e.sampleSize !== null ? ` · ${e.sampleSize} matches` : ""}</span>
                  </td>
                  <td className={cn("py-1.5 pr-3 text-right font-mono", e.passed === true ? "text-fg" : e.passed === false ? "text-muted" : "text-warn")}>{e.display}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-muted">
                    {e.comparator && e.threshold !== null ? `${e.comparator} ${e.metric.includes("probability") || e.metric.includes("rate") ? `${Math.round(e.threshold * 100)}%` : e.threshold}` : "—"}
                  </td>
                  <td className="py-1.5 text-right"><Badge tone={SOURCE[e.source]?.tone ?? "neutral"}>{SOURCE[e.source]?.label ?? e.source}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {decision.missingData.length > 0 && (
        <ul className="mt-3 space-y-1">
          {decision.missingData.map((m) => (
            <li key={m} className="flex items-start gap-1.5 text-xs text-warn"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{m}</li>
          ))}
        </ul>
      )}

      {onPickTeam && stats && (["home", "away"] as const).map((side) => {
        const r = stats[side].resolution;
        if (r.status !== "ambiguous" || r.candidates.length === 0) return null;
        return (
          <div key={side} className="mt-3 rounded-lg border border-warn/30 bg-warn-soft p-3 text-xs">
            <p className="text-warn">Which club is “{r.query}”?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {r.candidates.map((c) => (
                <Button key={c.id} size="sm" variant="secondary" onClick={() => onPickTeam(side, c.id)}>
                  {c.name}{c.country ? ` (${c.country})` : ""}
                </Button>
              ))}
            </div>
          </div>
        );
      })}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-0.5" role="radiogroup" aria-label={`Decision for ${fixture.homeTeam} vs ${fixture.awayTeam}`}>
          {(["KEEP", "REMOVE"] as const).map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={chosen === v}
              onClick={(e) => { e.stopPropagation(); onChoose(v); }}
              className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", chosen === v ? (v === "KEEP" ? "bg-accent text-ink" : "bg-danger text-white") : "text-muted hover:text-fg")}
            >
              {v === "KEEP" ? "Keep" : "Remove"}
            </button>
          ))}
        </div>
        <span className="text-xs text-faint" title="How complete the data behind this decision is. It is not the probability of any match outcome.">
          Data confidence {Math.round(decision.confidence * 100)}%
        </span>
        <button className="flex items-center gap-1 text-xs text-accent hover:text-accent-strong" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-expanded={open}>
          Match details <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div className="mt-4 border-t border-line pt-4">
          <MatchDetails detail={detail} stats={stats} />
        </div>
      )}
    </div>
  );
}
