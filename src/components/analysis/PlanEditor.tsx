"use client";

import { Info, ListFilter } from "lucide-react";
import type { Condition, FilterPlan } from "@/lib/domain/schemas";
import { getMetric } from "@/lib/filtering/metrics";
import { Badge, cn } from "../ui/primitives";

/**
 * Shows the structured interpretation of the user's instruction and lets them
 * adjust numeric thresholds. Nothing is evaluated until they confirm.
 */
export function PlanEditor({ plan, onChange, disabled }: { plan: FilterPlan; onChange: (p: FilterPlan) => void; disabled?: boolean }) {
  const setAt = (root: "removeWhen" | "keepWhen", path: number[], value: number) => {
    const next = structuredClone(plan);
    let node = next[root] as Condition;
    for (const i of path) {
      if (node.kind === "group") node = node.conditions[i]!;
      else if (node.kind === "not") node = node.condition;
    }
    if (node.kind === "metric") {
      node.value = value;
      node.thresholdInferred = false;
    }
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-faint"><ListFilter className="size-3.5" aria-hidden /> Interpretation</p>
        <p className="mt-1.5 text-sm">{plan.summary}</p>
        <p className="mt-2 text-xs text-muted">
          Mode: {plan.mode === "remove_matching" ? "remove fixtures that match the removal rule (exceptions are kept)" : "keep only fixtures that match the keep rule"}
        </p>
      </div>

      {plan.removeWhen && (
        <RuleBlock title="Remove when" tone="danger">
          <ConditionView c={plan.removeWhen} path={[]} onValue={(p, v) => setAt("removeWhen", p, v)} disabled={disabled} />
        </RuleBlock>
      )}
      {plan.keepWhen && (
        <RuleBlock title={plan.mode === "remove_matching" ? "But keep when" : "Keep only when"} tone="accent">
          <ConditionView c={plan.keepWhen} path={[]} onValue={(p, v) => setAt("keepWhen", p, v)} disabled={disabled} />
        </RuleBlock>
      )}

      {plan.assumptions.length > 0 && (
        <div className="rounded-xl border border-info/25 bg-info/5 p-3 text-xs text-fg/85">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-info"><Info className="size-3.5" aria-hidden /> Assumptions (you can change the thresholds above)</p>
          <ul className="list-disc space-y-0.5 pl-5">{plan.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
      {plan.unsupported.length > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn-soft p-3 text-xs text-fg/85">
          <p className="mb-1 font-medium text-warn">Not supported with the available data — ignored</p>
          <ul className="list-disc space-y-0.5 pl-5">{plan.unsupported.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function RuleBlock({ title, tone, children }: { title: string; tone: "danger" | "accent"; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border p-4", tone === "danger" ? "border-danger/30 bg-danger-soft/40" : "border-accent/30 bg-accent-soft/50")}>
      <p className={cn("mb-2 text-xs font-semibold uppercase tracking-wider", tone === "danger" ? "text-danger" : "text-accent-strong")}>{title}</p>
      {children}
    </div>
  );
}

const SUBJECT: Record<string, string> = { home: "home team", away: "away team", both: "both teams", either: "either team", match: "match" };

function ConditionView({ c, path, onValue, disabled }: { c: Condition; path: number[]; onValue: (path: number[], v: number) => void; disabled?: boolean }) {
  if (c.kind === "group") {
    return (
      <div className="space-y-2">
        {c.conditions.map((child, i) => (
          <div key={i}>
            {i > 0 && <Badge tone="neutral" className="my-1 font-mono">{c.operator}</Badge>}
            <div className={cn(child.kind === "group" && "rounded-lg border border-line p-2")}>
              <ConditionView c={child} path={[...path, i]} onValue={onValue} disabled={disabled} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (c.kind === "not") {
    return (
      <div>
        <Badge tone="neutral" className="mb-1 font-mono">NOT</Badge>
        <ConditionView c={c.condition} path={[...path, 0]} onValue={onValue} disabled={disabled} />
      </div>
    );
  }
  if (c.kind === "team") return <p className="text-sm">{SUBJECT[c.subject]} is <strong>{c.teams.join(" or ")}</strong></p>;
  if (c.kind === "competition") return <p className="text-sm">competition is <strong>{c.competitions.join(" or ")}</strong></p>;

  const def = getMetric(c.metric);
  const pct = def && (def.unit === "probability" || def.unit === "rate");
  const label = (def?.label ?? c.metric).replace("X", String(c.line ?? 2.5));
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>{label}</span>
      {c.subject !== "match" && <Badge tone="info">{SUBJECT[c.subject]}</Badge>}
      <span className="font-mono text-muted">{c.comparator}</span>
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          aria-label={`Threshold for ${label}`}
          className="w-20 rounded-lg border border-line bg-ink px-2 py-1 text-right font-mono text-sm focus:border-accent focus:outline-none"
          value={pct ? Math.round(c.value * 100) : c.value}
          step={pct ? 5 : 0.1}
          min={0}
          max={pct ? 100 : def?.unit === "points" ? 3 : 10}
          disabled={disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onValue(path, pct ? Math.max(0, Math.min(100, n)) / 100 : Math.max(0, n));
          }}
        />
        {pct && <span className="text-muted">%</span>}
      </span>
      {c.thresholdInferred && <Badge tone="warn">assumed</Badge>}
      {def && <span className="w-full text-xs text-faint">{def.source === "model_estimate" ? "Model estimate" : "Historical frequency"} · {def.description}</span>}
    </div>
  );
}
