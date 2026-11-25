"use client";

import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import type { Fixture } from "@/lib/domain/schemas";
import { Button, cn, Meter } from "../ui/primitives";

export const LOW_CONFIDENCE = 0.75;

const field = "w-full rounded-[2px] border border-transparent bg-transparent px-2 py-1.5 transition-colors hover:border-line focus:border-accent focus:bg-ink focus:outline-none disabled:opacity-50";

/**
 * Lets the user correct what the vision model extracted: team names,
 * competition, date, row boundaries, or mark a row as "not a fixture".
 * Rendered as a fixture sheet: one row per match, editable in place.
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
      issues: ["Added manually. Set the team names and row position."],
      userEdited: true,
      excluded: false,
    };
    onChange([...fixtures, nf]);
    onSelect(nf.id);
  };

  return (
    <div>
      <div className="kicker hidden grid-cols-[2.5rem_1fr_6rem] gap-3 pb-2 sm:grid" aria-hidden>
        <span>#</span>
        <span>Home v away · competition · date</span>
        <span className="text-right">Read</span>
      </div>
      <ul className="border-b border-line">
        {fixtures.map((f) => {
          const selected = selectedId === f.id;
          const missing = !f.excluded && (!f.homeTeam.trim() || !f.awayTeam.trim());
          const flagged = f.confidence < LOW_CONFIDENCE || f.issues.length > 0;
          return (
            <li
              key={f.id}
              onFocusCapture={() => onSelect(f.id)}
              onClick={() => onSelect(f.id)}
              data-selected={selected}
              data-state={flagged && !f.excluded ? "NEEDS_REVIEW" : undefined}
              className={cn("row-state grid grid-cols-[2.5rem_1fr] gap-x-3 border-t border-line py-3 pl-2 transition-colors sm:grid-cols-[2.5rem_1fr_6rem]", f.excluded && "opacity-55")}
            >
              <span className={cn("pt-2 font-mono text-[12px] tnum", selected ? "text-accent" : "text-faint")}>{f.id.slice(-2)}</span>

              <div className="min-w-0">
                {f.excluded ? (
                  <p className="py-1.5 text-sm text-muted">
                    <span className="line-through">{f.homeTeam || "?"} v {f.awayTeam || "?"}</span>
                    <span className="ml-2 font-mono text-[11px] text-faint">not a fixture</span>
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
                      <input aria-label={`${f.id} home team`} className={cn(field, "text-[15px] font-medium", !f.homeTeam.trim() && "border-danger/70")} value={f.homeTeam} placeholder="Home team" disabled={disabled} onChange={(e) => update(f.id, { homeTeam: e.target.value.slice(0, 80) })} />
                      <span className="px-1 font-mono text-[11px] text-faint">v</span>
                      <input aria-label={`${f.id} away team`} className={cn(field, "text-[15px] font-medium", !f.awayTeam.trim() && "border-danger/70")} value={f.awayTeam} placeholder="Away team" disabled={disabled} onChange={(e) => update(f.id, { awayTeam: e.target.value.slice(0, 80) })} />
                    </div>
                    <div className="mt-0.5 grid grid-cols-2 gap-1">
                      <input aria-label={`${f.id} competition`} className={cn(field, "font-mono text-[12px] text-muted")} value={f.competition ?? ""} placeholder="Competition" disabled={disabled} onChange={(e) => update(f.id, { competition: e.target.value.slice(0, 80) || null })} />
                      <input aria-label={`${f.id} date and time`} className={cn(field, "font-mono text-[12px] text-muted")} value={[f.date, f.kickoff].filter(Boolean).join(" ")} placeholder="Date and time" disabled={disabled} onChange={(e) => update(f.id, { date: e.target.value.slice(0, 40) || null, kickoff: null })} />
                    </div>
                  </>
                )}

                {flagged && f.issues.length > 0 && !f.excluded && (
                  <ul className="mt-2 space-y-0.5 px-2">
                    {f.issues.map((i) => <li key={i} className="text-[12px] text-warn">{i}</li>)}
                  </ul>
                )}
                {missing && <p className="mt-1 px-2 text-[12px] text-danger">Enter both team names, or mark this row as not a fixture.</p>}

                <div className="reveal" data-open={selected}>
                  <div inert={!selected}>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-dashed border-line px-2 pt-3 font-mono text-[11px] text-muted">
                      <span className="tnum">y {f.box.y} · h {f.box.height} px</span>
                      <span className="flex items-center gap-1">
                        Top edge
                        <Button size="sm" variant="ghost" className="h-7 px-1.5" aria-label="Move top edge up" disabled={disabled} onClick={() => nudge(f, "top", -4)}><ChevronUp className="size-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 px-1.5" aria-label="Move top edge down" disabled={disabled} onClick={() => nudge(f, "top", 4)}><ChevronDown className="size-3.5" /></Button>
                      </span>
                      <span className="flex items-center gap-1">
                        Bottom edge
                        <Button size="sm" variant="ghost" className="h-7 px-1.5" aria-label="Move bottom edge up" disabled={disabled} onClick={() => nudge(f, "bottom", -4)}><ChevronUp className="size-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 px-1.5" aria-label="Move bottom edge down" disabled={disabled} onClick={() => nudge(f, "bottom", 4)}><ChevronDown className="size-3.5" /></Button>
                      </span>
                      <label className="ml-auto flex cursor-pointer items-center gap-2 text-fg/80">
                        <input type="checkbox" className="size-3.5 accent-[var(--color-accent)]" checked={f.excluded} disabled={disabled} onChange={(e) => update(f.id, { excluded: e.target.checked })} />
                        Not a fixture
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-start-2 mt-2 flex items-center gap-3 px-2 sm:col-start-auto sm:mt-0 sm:flex-col sm:items-end sm:gap-1 sm:px-0 sm:pt-2.5 sm:pr-2">
                <Meter value={f.confidence} />
                {f.userEdited && <span className="font-mono text-[10px] text-faint">edited</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={addFixture}
        disabled={disabled}
        className="flex w-full items-center gap-3 border-b border-line py-3 pl-2 text-left text-sm text-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-40"
      >
        <Plus className="size-4 text-accent" aria-hidden /> Add a fixture the AI missed
      </button>
      <p className="mt-2 font-mono text-[11px] text-faint">Select a row to adjust its edges or mark it as not a fixture.</p>
    </div>
  );
}
