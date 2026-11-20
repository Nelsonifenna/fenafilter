import { Check, CircleDashed, Hourglass, Loader2, MinusCircle, XCircle } from "lucide-react";
import type { Step } from "@/lib/domain/schemas";
import { cn } from "../ui/primitives";

/** Renders the job's real processing steps as reported by the server. */
export function ProgressSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-1" aria-label="Analysis progress">
      {steps.map((s) => (
        <li key={s.id} className={cn("flex items-start gap-3 rounded-lg px-2 py-2", s.state === "active" && "bg-surface-2")}>
          <span className="mt-0.5 shrink-0">
            {s.state === "done" && <Check className="size-4 text-accent" aria-label="Done" />}
            {s.state === "active" && <Loader2 className="size-4 animate-spin text-info" aria-label="In progress" />}
            {s.state === "pending" && <CircleDashed className="size-4 text-faint" aria-label="Pending" />}
            {s.state === "waiting" && <Hourglass className="size-4 text-warn" aria-label="Waiting for you" />}
            {s.state === "failed" && <XCircle className="size-4 text-danger" aria-label="Failed" />}
            {s.state === "skipped" && <MinusCircle className="size-4 text-faint" aria-label="Skipped" />}
          </span>
          <div className="min-w-0">
            <p className={cn("text-sm", s.state === "pending" || s.state === "skipped" ? "text-faint" : "text-fg")}>{s.label}</p>
            {s.detail && <p className={cn("mt-0.5 text-xs break-words", s.state === "failed" ? "text-danger" : "text-muted")}>{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
