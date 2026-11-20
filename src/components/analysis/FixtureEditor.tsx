"use client";

import { AlertTriangle, ChevronDown, ChevronUp, EyeOff, Plus } from "lucide-react";
import type { Fixture } from "@/lib/domain/schemas";
import { Badge, Button, cn, inputClass } from "../ui/primitives";

export const LOW_CONFIDENCE = 0.75;

/**
 * Lets the user correct what the vision model extracted: team names,
 * competition, date, row boundaries, or mark a row as "not a fixture".
 */
export function FixtureEditor({
  fixtures,
  onChange,
  imageHeight,
  imageWidth,
  selectedId,
  onSelect,
  disabled,
}: {
  fixtures: Fixture[];
  onChange: (f: Fixture[]) => void;
  imageHeight: number;
  imageWidth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const update = (id: string, patch: Partial<Fixture>) =>
    onChange(fixtures.map((f) => (f.id === id ? { ...f, ...patch, userEdited: true } : f)));

  const nudge = (f: Fixture, edge: "top" | "bottom", delta: number) => {
    const b = { ...f.box };
    if (edge === "top") {
      const y = Math.max(0, Math.min(b.y + delta, b.y + b.height - 4));
      b.height += b.y - y;
      b.y = y;
    } else {
      b.height = Math.max(4, Math.min(b.height + delta, imageHeight - b.y));
    }
    update(f.id, { box: b });
  };

  const addFixture = () => {
    const nextNum = Math.max(0, ...fixtures.map((f) => Number(f.id.slice(6)))) + 1;
    const last = [...fixtures].sort((a, b) => a.box.y - b.box.y).at(-1);
    const y = Math.min(imageHeight - 40, last ? last.box.y + last.box.height + 4 : 0);
    const nf: Fixture = {
      id: `match_${String(nextNum).padStart(3, "0")}`,
      homeTeam: "",
      awayTeam: "",
      competition: last?.competition ?? null,
      date: null,
      kickoff: null,
      odds: [],
      confidence: 1,
      box: { x: 0, y: Math.max(0, y), width: imageWidth, height: Math.min(80, imageHeight - Math.max(0, y)) },
      issues: ["Added manually — set the team names and row position."],
      userEdited: true,
      excluded: false,
    };
    onChange([...fixtures, nf]);
    onSelect(nf.id);
  };

  return (
    <div className="space-y-3">
      {fixtures.map((f) => {
        const low = f.confidence < LOW_CONFIDENCE || f.issues.length > 0;
        const missing = !f.excluded && (!f.homeTeam.trim() || !f.awayTeam.trim());
        return (
          <div
            key={f.id}
            onFocusCapture={() => onSelect(f.id)}
            onClick={() => onSelect(f.id)}
            className={cn(
              "rounded-xl border p-4 transition-colors",
              selectedId === f.id ? "border-accent/60 bg-surface-2" : "border-line bg-surface",
              f.excluded && "opacity-60",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-faint">{f.id.replace("match_", "#")}</span>
                <Badge tone={f.confidence >= 0.9 ? "accent" : f.confidence >= LOW_CONFIDENCE ? "info" : "warn"}>{Math.round(f.confidence * 100)}% confidence</Badge>
                {f.userEdited && <Badge tone="neutral">Edited</Badge>}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input type="checkbox" className="accent-[var(--color-accent)]" checked={f.excluded} disabled={disabled} onChange={(e) => update(f.id, { excluded: e.target.checked })} />
                <EyeOff className="size-3.5" aria-hidden /> Not a fixture
              </label>
            </div>

            {low && f.issues.length > 0 && (
              <ul className="mt-2 space-y-1">
                {f.issues.map((i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-warn"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{i}</li>
                ))}
              </ul>
            )}

            {!f.excluded && (
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <input aria-label={`${f.id} home team`} className={cn(inputClass, !f.homeTeam.trim() && "border-danger/60")} value={f.homeTeam} placeholder="Home team" disabled={disabled} onChange={(e) => update(f.id, { homeTeam: e.target.value.slice(0, 80) })} />
                <span className="text-center text-xs text-faint">vs</span>
                <input aria-label={`${f.id} away team`} className={cn(inputClass, !f.awayTeam.trim() && "border-danger/60")} value={f.awayTeam} placeholder="Away team" disabled={disabled} onChange={(e) => update(f.id, { awayTeam: e.target.value.slice(0, 80) })} />
                <input aria-label={`${f.id} competition`} className={cn(inputClass, "sm:col-span-1")} value={f.competition ?? ""} placeholder="Competition (optional)" disabled={disabled} onChange={(e) => update(f.id, { competition: e.target.value.slice(0, 80) || null })} />
                <span className="hidden sm:block" />
                <input aria-label={`${f.id} date`} className={inputClass} value={[f.date, f.kickoff].filter(Boolean).join(" ")} placeholder="Date / time (optional)" disabled={disabled} onChange={(e) => update(f.id, { date: e.target.value.slice(0, 40) || null, kickoff: null })} />
              </div>
            )}
            {missing && <p className="mt-2 text-xs text-danger">Enter both team names, or mark this row as not a fixture.</p>}

            {selectedId === f.id && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-muted">
                <span>Row position: y {f.box.y}px, height {f.box.height}px</span>
                <span className="flex items-center gap-1">
                  Top
                  <Button size="sm" variant="secondary" aria-label="Move top edge up" disabled={disabled} onClick={() => nudge(f, "top", -4)}><ChevronUp className="size-3.5" /></Button>
                  <Button size="sm" variant="secondary" aria-label="Move top edge down" disabled={disabled} onClick={() => nudge(f, "top", 4)}><ChevronDown className="size-3.5" /></Button>
                </span>
                <span className="flex items-center gap-1">
                  Bottom
                  <Button size="sm" variant="secondary" aria-label="Move bottom edge up" disabled={disabled} onClick={() => nudge(f, "bottom", -4)}><ChevronUp className="size-3.5" /></Button>
                  <Button size="sm" variant="secondary" aria-label="Move bottom edge down" disabled={disabled} onClick={() => nudge(f, "bottom", 4)}><ChevronDown className="size-3.5" /></Button>
                </span>
              </div>
            )}
          </div>
        );
      })}
      <Button variant="secondary" className="w-full" onClick={addFixture} disabled={disabled}>
        <Plus className="size-4" aria-hidden /> Add a missed fixture
      </Button>
    </div>
  );
}
