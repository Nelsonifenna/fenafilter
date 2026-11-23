"use client";

import { EXAMPLE_INSTRUCTIONS } from "@/lib/examples";
import { cn, inputClass } from "../ui/primitives";

export const MAX_INSTRUCTION = 1500;

export function InstructionBox({ value, onChange, disabled, id = "instruction", showExamples = true }: { value: string; onChange: (v: string) => void; disabled?: boolean; id?: string; showExamples?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">Filtering instruction</label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_INSTRUCTION))}
        disabled={disabled}
        rows={5}
        placeholder="Remove matches where both teams are likely to score, but keep games where the away side rarely scores."
        className={cn(inputClass, "min-h-32 resize-y px-4 py-3 text-[15px] leading-relaxed")}
      />
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-faint">
        <span>Plain English. Any rules.</span>
        <span className="tnum" aria-label={`${value.length} of ${MAX_INSTRUCTION} characters`}>
          {value.length} of {MAX_INSTRUCTION}
        </span>
      </div>
      {showExamples && (
        <div className="mt-6">
          <p className="kicker">Examples</p>
          <ul className="mt-2 border-b border-line">
            {EXAMPLE_INSTRUCTIONS.slice(0, 4).map((ex, i) => (
              <li key={ex}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(ex)}
                  aria-pressed={value === ex}
                  className={cn(
                    "group grid w-full grid-cols-[1.75rem_1fr] items-baseline gap-2 border-t border-line py-2.5 text-left text-[13px] transition-colors disabled:opacity-50",
                    value === ex ? "text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  <span className={cn("font-mono text-[11px] tnum", value === ex ? "text-accent" : "text-faint group-hover:text-accent")}>{String(i + 1).padStart(2, "0")}</span>
                  <span>{ex}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
