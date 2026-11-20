"use client";

import type { FixtureStats } from "@/lib/domain/schemas";
import type { MatchDetailView, SplitView, TeamDetailView } from "@/lib/jobs/view";
import { Badge, cn } from "../ui/primitives";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);
const num = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "—" : v.toFixed(d));

function FormPills({ form }: { form: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Recent form ${form}`}>
      {form.split("").map((r, i) => (
        <span key={i} className={cn("grid size-5 place-items-center rounded text-[10px] font-bold", r === "W" ? "bg-accent/20 text-accent-strong" : r === "D" ? "bg-surface-3 text-muted" : "bg-danger/20 text-danger")}>{r}</span>
      ))}
    </span>
  );
}

const ROWS: { key: keyof SplitView; label: string; fmt: (v: never) => string }[] = [
  { key: "played", label: "Matches", fmt: (v: number) => String(v) },
  { key: "record", label: "Record", fmt: (v: string) => v },
  { key: "avgFor", label: "Goals scored / game", fmt: (v: number | null) => num(v) },
  { key: "avgAgainst", label: "Goals conceded / game", fmt: (v: number | null) => num(v) },
  { key: "bttsRate", label: "Both teams scored", fmt: (v: number | null) => pct(v) },
  { key: "cleanSheetRate", label: "Clean sheets", fmt: (v: number | null) => pct(v) },
  { key: "failedToScoreRate", label: "Failed to score", fmt: (v: number | null) => pct(v) },
  { key: "over25Rate", label: "Over 2.5 goals", fmt: (v: number | null) => pct(v) },
];

function TeamTable({ team, venue }: { team: TeamDetailView; venue: "home" | "away" }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{team.name}</p>
        <span className="flex items-center gap-2 text-xs text-muted">
          <FormPills form={team.form} /> {team.formPointsPerGame !== null && `${team.formPointsPerGame.toFixed(2)} pts/game`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-faint">
              <th className="py-1 text-left font-normal" scope="col">Recent matches</th>
              <th className="py-1 text-right font-normal" scope="col">All</th>
              <th className={cn("py-1 text-right font-normal", venue === "home" && "text-accent")} scope="col">Home</th>
              <th className={cn("py-1 text-right font-normal", venue === "away" && "text-accent")} scope="col">Away</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ROWS.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="py-1 text-left font-normal text-muted">{r.label}</th>
                {(["overall", "home", "away"] as const).map((s) => (
                  <td key={s} className={cn("py-1 text-right font-mono", s === venue && "text-fg", s !== venue && s !== "overall" && "text-muted")}>
                    {(r.fmt as (v: unknown) => string)(team[s][r.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MatchDetails({ detail, stats }: { detail: MatchDetailView | undefined; stats: FixtureStats | undefined }) {
  if (!stats) return <p className="text-sm text-muted">No football statistics were needed or retrieved for this fixture.</p>;
  const sides = [
    { key: "home" as const, data: stats.home, view: detail?.home ?? null },
    { key: "away" as const, data: stats.away, view: detail?.away ?? null },
  ];
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-faint">
          Sourced statistics <Badge tone="neutral">Historical match data</Badge>
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          {sides.map(({ key, data, view }) => (
            <div key={key} className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-faint">{key} team</p>
              {data.resolution.status === "matched" && data.resolution.team ? (
                <p className="mb-2 text-xs text-muted">
                  Identified as <span className="text-fg">{data.resolution.team.name}</span>
                  {data.resolution.team.country ? ` (${data.resolution.team.country})` : ""} · match method: {data.resolution.method}
                </p>
              ) : (
                <p className="mb-2 text-xs text-warn">{data.resolution.message ?? `Team “${data.resolution.query}” could not be identified.`}</p>
              )}
              {view ? <TeamTable team={view} venue={key} /> : <p className="text-xs text-muted">{data.error ?? `Not enough finished matches (${data.recent.length} found).`}</p>}
              {data.recent.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-accent">Show {data.recent.length} recent results</summary>
                  <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-muted">
                    {data.recent.map((m) => (
                      <li key={m.fixtureId} className="flex justify-between gap-2">
                        <span className="truncate">{m.date.slice(0, 10)} {m.venue === "home" ? "vs" : "@"} {m.opponent}</span>
                        <span className={m.goalsFor > m.goalsAgainst ? "text-accent" : m.goalsFor < m.goalsAgainst ? "text-danger" : ""}>{m.goalsFor}-{m.goalsAgainst}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {data.stale && <p className="mt-2 text-xs text-warn">Most recent match is older than 45 days — data may not reflect current form.</p>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-faint">
          Calculated estimates <Badge tone="info">Poisson model</Badge>
        </p>
        {detail?.model ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Expected goals (home)", num(detail.model.lambdaHome)],
              ["Expected goals (away)", num(detail.model.lambdaAway)],
              ["Both teams score", pct(detail.model.pBtts)],
              ["Over 2.5 goals", pct(detail.model.pOver25)],
              ["Home win", pct(detail.model.pHomeWin)],
              ["Draw", pct(detail.model.pDraw)],
              ["Away win", pct(detail.model.pAwayWin)],
              ["Under 2.5 goals", pct(detail.model.pUnder25)],
              ["Home scores", pct(detail.model.pHomeScores)],
              ["Away scores", pct(detail.model.pAwayScores)],
              ["Home clean sheet", pct(detail.model.pHomeCleanSheet)],
              ["Away clean sheet", pct(detail.model.pAwayCleanSheet)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                <p className="text-[11px] text-faint">{k}</p>
                <p className="font-mono text-sm">{v}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Not available — both teams need at least 5 recent finished matches.</p>
        )}
        {detail?.model?.notes.map((n) => <p key={n} className="mt-2 text-xs text-muted">{n}</p>)}
        {stats.prediction && (
          <p className="mt-3 text-xs text-muted">
            API-Football prediction (sourced): home {pct(stats.prediction.percentHome)} · draw {pct(stats.prediction.percentDraw)} · away {pct(stats.prediction.percentAway)}
            {stats.prediction.advice ? ` · “${stats.prediction.advice}”` : ""}
          </p>
        )}
      </div>
      <p className="text-[11px] text-faint">
        Source: {stats.source} · retrieved {new Date(stats.fetchedAt).toLocaleString()}
        {stats.home.dataAsOf ? ` · latest home-team match ${stats.home.dataAsOf.slice(0, 10)}` : ""}
        {stats.away.dataAsOf ? ` · latest away-team match ${stats.away.dataAsOf.slice(0, 10)}` : ""}
      </p>
    </div>
  );
}
