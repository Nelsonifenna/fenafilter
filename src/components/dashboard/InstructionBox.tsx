"use client";

import { Lightbulb } from "lucide-react";
import { EXAMPLE_INSTRUCTIONS } from "@/lib/examples";
import { cn, inputClass } from "../ui/primitives";

export const MAX_INSTRUCTION = 1500;

export function InstructionBox({ value, onChange, disabled, id = "instruction" }: { value: string; onChange: (v: string) => void; disabled?: boolean; id?: string }) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">Filtering instruction</label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_INSTRUCTION))}
        disabled={disabled}
        rows={4}
        placeholder="e.g. Remove matches where both teams are likely to score, but keep games where the away side rarely scores."
        className={cn(inputClass, "min-h-28 resize-y leading-relaxed")}
      />
      <div className="mt-1 flex justify-end text-xs text-faint">{value.length}/{MAX_INSTRUCTION}</div>
      <div className="mt-2">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
          <Lightbulb className="size-3.5 text-accent" aria-hidden /> Try an example
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_INSTRUCTIONS.slice(0, 4).map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={disabled}
              onClick={() => onChange(ex)}
              className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-left text-xs text-fg/85 transition-colors hover:border-accent/40 hover:text-fg disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
