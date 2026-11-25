"use client";

import type { Condition, FilterPlan } from "@/lib/domain/schemas";
import { getMetric } from "@/lib/filtering/metrics";
import { cn } from "../ui/primitives";

/**
 * The structured interpretation of the user's instruction, shown as a
 * rulebook. Numeric thresholds are editable; nothing runs until confirmed.
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
    <div className="space-y-6">
      <div>
        <p className="text-[15px] leading-relaxed text-fg/90">{plan.summary}</p>
        <p className="mt-2 font-mono text-[11px] text-faint">
          {plan.mode === "remove_matching" ? "Mode: remove matching fixtures, keep exceptions" : "Mode: keep only matching fixtures"}
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
        <div>
          <p className="kicker">Assumptions</p>
          <ul className="mt-2 space-y-1 text-[13px] text-muted">
            {plan.assumptions.map((a) => (
              <li key={a} className="grid grid-cols-[1rem_1fr]"><span className="text-warn" aria-hidden>·</span>{a}</li>
            ))}
          </ul>
          <p className="mt-2 font-mono text-[11px] text-faint">Change any threshold above to override an assumption.</p>
        </div>
      )}
      {plan.unsupported.length > 0 && (
        <div className="border-l-2 border-warn pl-4">
          <p className="text-sm font-semibold text-warn">Not supported by the available data, so ignored</p>
          <ul className="mt-1 space-y-0.5 text-[13px] text-fg/80">{plan.unsupported.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function RuleBlock({ title, tone, children }: { title: string; tone: "danger" | "accent"; children: React.ReactNode }) {
  return (
    <section className={cn("border-l-2 pl-4", tone === "danger" ? "border-danger" : "border-accent")}>
      <p className={cn("kicker", tone === "danger" ? "text-danger" : "text-accent")}>{title}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

const CMP: Record<string, string> = { ">=": "≥", "<=": "≤", ">": ">", "<": "<" };
const CMP_LABEL: Record<string, string> = { ">=": "at least", "<=": "at most", ">": "more than", "<": "less than" };
const SUBJECT: Record<string, string> = { home: "home team", away: "away team", both: "both teams", either: "either team", match: "match" };

function ConditionView({ c, path, onValue, disabled }: { c: Condition; path: number[]; onValue: (path: number[], v: number) => void; disabled?: boolean }) {
  if (c.kind === "group") {
    return (
      <div>
        {c.conditions.map((child, i) => (
          <div key={i}>
            {i > 0 && (
              <div className="flex items-center gap-3 py-1" aria-label={c.operator === "AND" ? "and" : "or"}>
                <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-muted">{c.operator}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
            <div className={cn(child.kind === "group" && "border-l border-line-strong pl-3")}>
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
        <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-muted">NOT</p>
        <div className="border-l border-line-strong pl-3">
          <ConditionView c={c.condition} path={[...path, 0]} onValue={onValue} disabled={disabled} />
        </div>
      </div>
    );
  }
  if (c.kind === "team") {
    return <p className="py-2 text-sm"><span className="text-muted">{SUBJECT[c.subject]} is</span> {c.teams.join(" or ")}</p>;
  }
  if (c.kind === "competition") {
    return <p className="py-2 text-sm"><span className="text-muted">competition is</span> {c.competitions.join(" or ")}</p>;
  }

  const def = getMetric(c.metric);
  const pct = def && (def.unit === "probability" || def.unit === "rate");
  const label = (def?.label ?? c.metric).replace("X", String(c.line ?? 2.5));
  return (
    <div className="py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
        <span className="font-medium">{label}</span>
        {c.subject !== "match" && <span className="text-muted">· {SUBJECT[c.subject]}</span>}
        {(c.window || c.lastN) && (
          <span className="font-mono text-[11px] text-faint">
            {[c.window === "overall" ? "all matches" : c.window === "venue" ? "home or away games" : null, c.lastN ? `last ${c.lastN}` : null].filter(Boolean).join(", ")}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <span className="font-mono text-muted" aria-label={CMP_LABEL[c.comparator]}>{CMP[c.comparator]}</span>
          <input
            type="number"
            aria-label={`Threshold for ${label}`}
            className="w-16 rounded-[2px] border border-line bg-ink px-2 py-1 text-right font-mono text-sm tnum transition-colors hover:border-line-strong focus:border-accent focus:outline-none disabled:opacity-50"
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
          <span className="w-4 font-mono text-muted">{pct ? "%" : ""}</span>
        </span>
      </div>
      {def && (
        <p className="mt-1 text-[12px] text-faint">
          <span className={c.thresholdInferred ? "text-warn" : undefined}>{c.thresholdInferred ? "Assumed threshold · " : ""}</span>
          {def.source === "model_estimate" ? "Model estimate" : "Historical frequency"}: {def.description}
        </p>
      )}
    </div>
  );
}
