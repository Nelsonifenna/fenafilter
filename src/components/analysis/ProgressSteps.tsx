import type { Step } from "@/lib/domain/schemas";
import { cn } from "../ui/primitives";

const STATE_TEXT: Record<Step["state"], string> = {
  done: "Done",
  active: "Live",
  pending: "Queued",
  waiting: "Your turn",
  failed: "Failed",
  skipped: "Skipped",
};

/** The job's real processing steps, rendered like a match timeline. */
export function ProgressSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="relative" aria-label="Analysis progress">
      {steps.map((s, i) => (
        <li key={s.id} className={cn("grid grid-cols-[2rem_0.75rem_1fr_auto] items-start gap-x-3 border-t border-line py-3 transition-colors", s.state === "active" && "bg-surface")}>
          <span className="pl-1 font-mono text-[11px] text-faint tnum">{String(i + 1).padStart(2, "0")}</span>
          <span className="mt-[5px] flex justify-center" aria-hidden>
            <span
              className={cn(
                "size-2",
                s.state === "done" && "bg-accent",
                s.state === "active" && "animate-tick bg-accent",
                s.state === "pending" && "border border-line-strong",
                s.state === "waiting" && "bg-warn",
                s.state === "failed" && "bg-danger",
                s.state === "skipped" && "h-px w-2 bg-faint",
              )}
            />
          </span>
          <div className="min-w-0">
            <p className={cn("text-sm", s.state === "pending" || s.state === "skipped" ? "text-faint" : "text-fg")}>{s.label}</p>
            {s.detail && <p className={cn("mt-0.5 break-words text-[12px]", s.state === "failed" ? "text-danger" : "text-muted")}>{s.detail}</p>}
          </div>
          <span
            className={cn(
              "pr-1 font-mono text-[11px]",
              s.state === "done" && "text-accent",
              s.state === "active" && "text-fg",
              s.state === "waiting" && "text-warn",
              s.state === "failed" && "text-danger",
              (s.state === "pending" || s.state === "skipped") && "text-faint",
            )}
          >
            {STATE_TEXT[s.state]}
          </span>
        </li>
      ))}
    </ol>
  );
}
