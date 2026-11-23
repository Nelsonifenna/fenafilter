import { type Condition, type FilterPlan, FilterPlanSchema } from "../domain/schemas";
import { getMetric } from "./metrics";

export interface PlanValidation {
  ok: boolean;
  plan: FilterPlan | null;
  problems: string[];
}

/**
 * Semantic validation on top of the Zod schema. The language model's output
 * is a PROPOSAL; this decides whether it is usable.
 */
export function validatePlan(input: unknown): PlanValidation {
  const parsed = FilterPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      plan: null,
      problems: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "plan"}: ${i.message}`),
    };
  }
  const plan = structuredClone(parsed.data);
  const problems: string[] = [];

  const fix = (c: Condition | null): Condition | null => {
    if (!c) return c;
    switch (c.kind) {
      case "metric": {
        const def = getMetric(c.metric);
        if (!def) {
          problems.push(`Unknown metric ${c.metric}.`);
          return c;
        }
        if (def.scope === "match" && c.subject !== "match") c.subject = "match";
        if (def.scope === "team" && c.subject === "match") {
          problems.push(`"${def.label}" must apply to the home team, away team, both or either — not the match.`);
        }
        if ((def.unit === "probability" || def.unit === "rate") && c.value > 1) {
          // Model wrote 60 instead of 0.6.
          if (c.value <= 100) c.value = c.value / 100;
          else problems.push(`Threshold for ${def.label} must be between 0 and 1.`);
        }
        if (def.unit === "points" && c.value > 3) problems.push("Points-per-game threshold must be between 0 and 3.");
        if (def.needsLine && (c.line === undefined || c.line === null)) c.line = 2.5;
        if (def.needsLine && c.line !== null && c.line !== undefined && Math.abs((c.line % 1) - 0.5) > 1e-9) {
          problems.push(`Goal line ${c.line} should be a half-goal line like 1.5, 2.5 or 3.5.`);
        }
        if (!def.needsLine) c.line = null;
        if (def.basis === "league" && def.needsLine && c.line !== null && c.line !== undefined && c.line > 3.5) {
          problems.push("League over/under figures are available for 0.5, 1.5, 2.5 and 3.5 goals only.");
        }
        // Match windows only make sense for team figures computed from a list of matches.
        const windowed = def.windowed === true || c.metric === "form_points_per_game";
        if (!windowed) {
          delete c.window;
          delete c.lastN;
        } else if (c.metric === "form_points_per_game") {
          delete c.window;
        }
        return c;
      }
      case "group":
        c.conditions = c.conditions.map((x) => fix(x)!).filter(Boolean);
        return c;
      case "not":
        c.condition = fix(c.condition)!;
        return c;
      default:
        return c;
    }
  };
  plan.removeWhen = fix(plan.removeWhen);
  plan.keepWhen = fix(plan.keepWhen);

  if (plan.status === "needs_clarification") {
    if (!plan.clarificationQuestion) problems.push("The instruction needs clarification but no question was provided.");
    return { ok: problems.length === 0, plan, problems };
  }
  if (plan.mode === "remove_matching" && !plan.removeWhen) {
    problems.push("The instruction did not contain anything to remove.");
  }
  if (plan.mode === "keep_only_matching" && !plan.keepWhen) {
    problems.push("The instruction did not say which matches to keep.");
  }
  return { ok: problems.length === 0, plan, problems };
}

/** Human-readable rendering of a condition tree (used in the UI and for AI summaries). */
export function describeCondition(c: Condition | null): string {
  if (!c) return "—";
  switch (c.kind) {
    case "metric": {
      const def = getMetric(c.metric);
      const label = def?.label.replace("X", String(c.line ?? 2.5)) ?? c.metric;
      const scope = [c.window === "overall" ? "all matches" : c.window === "venue" ? "home or away games" : null, c.lastN ? `last ${c.lastN}` : null].filter(Boolean).join(", ");
      const pct = def && (def.unit === "probability" || def.unit === "rate");
      const v = pct ? `${Math.round(c.value * 100)}%` : String(c.value);
      const subj = c.subject === "match" ? "" : c.subject === "both" ? " (both teams)" : c.subject === "either" ? " (either team)" : ` (${c.subject} team)`;
      return `${label}${subj}${scope ? ` [${scope}]` : ""} ${c.comparator} ${v}`;
    }
    case "team":
      return `${c.subject === "either" ? "Either team" : c.subject === "home" ? "Home team" : "Away team"} is ${c.teams.join(" or ")}`;
    case "competition":
      return `Competition is ${c.competitions.join(" or ")}`;
    case "group":
      return c.conditions.map((x) => (x.kind === "group" ? `(${describeCondition(x)})` : describeCondition(x))).join(` ${c.operator} `);
    case "not":
      return `NOT (${describeCondition(c.condition)})`;
  }
}
