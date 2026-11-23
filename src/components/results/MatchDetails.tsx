"use client";

import { useState } from "react";
import type { MatchDetailView, PublicFixtureStats, SplitView, TeamDetailView } from "@/lib/jobs/view";
import { cn } from "../ui/primitives";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);
const num = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "—" : v.toFixed(d));

function Form({ form }: { form: string }) {
  if (!form) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex gap-px" aria-label={`Recent form, most recent first: ${form.split("").join(" ")}`}>
      {form.split("").map((r, i) => (
        <span key={i} className={cn("grid h-5 w-4 place-items-center font-mono text-[10px] font-semibold", r === "W" ? "bg-accent text-accent-ink" : r === "D" ? "bg-surface-3 text-fg" : "bg-danger/80 text-ink")}>{r}</span>
      ))}
    </span>
  );
}

/** Broadcast-style comparison row: home value · label · away value. */
function Row({ label, home, away, emphasis }: { label: string; home: React.ReactNode; away: React.ReactNode; emphasis?: "home" | "away" | null }) {
  return (
    <div className="grid grid-cols-[1fr_minmax(7rem,1.3fr)_1fr] items-center gap-3 border-t border-line py-2">
      <span className={cn("font-mono text-[13px] tnum", emphasis === "home" ? "text-fg" : "text-fg/80")}>{home}</span>
      <span className="text-center text-[12px] text-muted">{label}</span>
      <span className={cn("text-right font-mono text-[13px] tnum", emphasis === "away" ? "text-fg" : "text-fg/80")}>{away}</span>
    </div>
  );
}

/** 1X2 probability bar (model estimate). */
function OutcomeBar({ home, draw, away }: { home: number; draw: number; away: number }) {
  const seg = [
    { k: "Home", v: home, cls: "bg-fg" },
    { k: "Draw", v: draw, cls: "bg-line-strong" },
    { k: "Away", v: away, cls: "bg-muted" },
  ];
  return (
    <div>
      <div className="flex justify-between font-mono text-[12px] tnum">
        {seg.map((s) => (
          <span key={s.k} className={cn(s.k === "Draw" && "text-muted")}>
            <span className="text-faint">{s.k === "Home" ? "1" : s.k === "Draw" ? "X" : "2"} </span>
            {pct(s.v)}
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex h-2 gap-px" role="img" aria-label={`Model estimate: home win ${pct(home)}, draw ${pct(draw)}, away win ${pct(away)}`}>
        {seg.map((s) => <span key={s.k} className={s.cls} style={{ width: `${s.v * 100}%` }} />)}
      </div>
    </div>
  );
}

export function MatchDetails({ detail, stats }: { detail: MatchDetailView | undefined; stats: PublicFixtureStats | undefined }) {
  const [scope, setScope] = useState<"venue" | "overall">("venue");
  if (!stats) return <p className="text-sm text-muted">No football statistics were needed or retrieved for this fixture.</p>;

  const h = detail?.home ?? null;
  const a = detail?.away ?? null;
  const split = (t: TeamDetailView | null, venue: "home" | "away"): SplitView | null => (t ? (scope === "venue" ? t[venue] : t.overall) : null);
  const hs = split(h, "home");
  const as = split(a, "away");
  const more = (x: number | null | undefined, y: number | null | undefined, higherIsBetter = true) =>
    x == null || y == null || x === y ? null : (x > y) === higherIsBetter ? "home" : "away";

  const m = detail?.model ?? null;

  return (
    <div className="space-y-8">
      {/* Identity */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        {(["home", "away"] as const).map((side, i) => {
          const r = stats[side].resolution;
          const block = (
            <div key={side} className={cn("min-w-0", i === 1 && "text-right")}>
              <p className="kicker">{side} team</p>
              {r.status === "matched" && r.team ? (
                <>
                  <p className="mt-1 truncate font-display text-xl font-semibold uppercase">{r.team.name}</p>
                  <p className="font-mono text-[11px] text-faint">
                    {r.team.country ?? "Country unknown"}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[13px] text-warn">{r.message ?? `“${r.query}” could not be identified.`}</p>
              )}
              {stats[side].stale && <p className="mt-1 text-[12px] text-warn">Latest match is over 45 days old.</p>}
            </div>
          );
          return i === 0 ? [block, <span key="v" className="pt-6 font-mono text-[12px] text-faint">v</span>] : block;
        })}
      </div>

      {/* Model estimate */}
      <section>
        <div className="flex items-baseline justify-between gap-4">
          <p className="kicker">Calculated estimates</p>
          <span className="font-mono text-[11px] text-faint">Statistical model</span>
        </div>
        {m ? (
          <div className="mt-3 space-y-4">
            <OutcomeBar home={m.pHomeWin} draw={m.pDraw} away={m.pAwayWin} />
            <div>
              <Row label="Expected goals" home={num(m.lambdaHome)} away={num(m.lambdaAway)} />
              <Row label="Scores at least once" home={pct(m.pHomeScores)} away={pct(m.pAwayScores)} />
              <Row label="Keeps a clean sheet" home={pct(m.pHomeCleanSheet)} away={pct(m.pAwayCleanSheet)} />
              <div className="grid grid-cols-3 gap-px border-t border-line bg-line pt-px">
                {[
                  ["Both teams score", m.pBtts],
                  ["Over 2.5 goals", m.pOver25],
                  ["Under 2.5 goals", m.pUnder25],
                ].map(([k, v]) => (
                  <div key={k as string} className="bg-ink py-2.5 text-center">
                    <p className="font-mono text-[15px] tnum">{pct(v as number)}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{k}</p>
                  </div>
                ))}
              </div>
            </div>
            {m.notes.map((n) => <p key={n} className="text-[12px] text-muted">{n}</p>)}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Not available — both clubs need at least 5 recent finished matches.</p>
        )}
        {stats.prediction && (
          <p className="mt-3 font-mono text-[11px] text-muted">
            Third-party prediction (sourced): 1 {pct(stats.prediction.percentHome)} · X {pct(stats.prediction.percentDraw)} · 2 {pct(stats.prediction.percentAway)}
            {stats.prediction.advice ? ` · “${stats.prediction.advice}”` : ""}
          </p>
        )}
      </section>

      {/* Historical figures */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="kicker">Sourced statistics</p>
          <div className="flex border border-line" role="radiogroup" aria-label="Statistics scope">
            {(["venue", "overall"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={scope === s}
                onClick={() => setScope(s)}
                className={cn("px-2.5 py-1 font-mono text-[11px] transition-colors", scope === s ? "bg-fg text-ink" : "text-muted hover:text-fg")}
              >
                {s === "venue" ? "Home and away" : "All matches"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[12px] text-faint">
          {scope === "venue" ? "Home team’s home games against the away team’s away games." : "Each club’s most recent finished matches in all competitions."}
        </p>
        {hs || as ? (
          <div className="mt-3">
            <Row label="Matches" home={hs?.played ?? "—"} away={as?.played ?? "—"} />
            <Row label="Record" home={hs?.record ?? "—"} away={as?.record ?? "—"} />
            <Row label="Goals scored per game" home={num(hs?.avgFor)} away={num(as?.avgFor)} emphasis={more(hs?.avgFor, as?.avgFor)} />
            <Row label="Goals conceded per game" home={num(hs?.avgAgainst)} away={num(as?.avgAgainst)} emphasis={more(hs?.avgAgainst, as?.avgAgainst, false)} />
            <Row label="Both teams scored" home={pct(hs?.bttsRate)} away={pct(as?.bttsRate)} />
            <Row label="Clean sheets" home={pct(hs?.cleanSheetRate)} away={pct(as?.cleanSheetRate)} emphasis={more(hs?.cleanSheetRate, as?.cleanSheetRate)} />
            <Row label="Failed to score" home={pct(hs?.failedToScoreRate)} away={pct(as?.failedToScoreRate)} emphasis={more(hs?.failedToScoreRate, as?.failedToScoreRate, false)} />
            <Row label="Over 2.5 goals" home={pct(hs?.over25Rate)} away={pct(as?.over25Rate)} />
            <Row label="Form, latest first" home={<Form form={h?.form ?? ""} />} away={<span className="inline-flex justify-end"><Form form={a?.form ?? ""} /></span>} />
            <Row label="Points per game" home={num(h?.formPointsPerGame)} away={num(a?.formPointsPerGame)} emphasis={more(h?.formPointsPerGame, a?.formPointsPerGame)} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">{stats.home.error ?? stats.away.error ?? "Not enough finished matches for either club."}</p>
        )}
      </section>

      {/* League context */}
      {stats.league && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="kicker">League context</p>
            <span className="font-mono text-[11px] text-faint">
              {stats.league.identifiedBy === "shared_matches" ? "identified from both clubs’ fixtures" : "matched to the competition on the screenshot"}
            </span>
          </div>
          <p className="mt-2 text-sm">
            {stats.league.name}
            <span className="text-muted">
              {stats.league.country ? ` · ${stats.league.country}` : ""} · {stats.league.season}/{String(stats.league.season + 1).slice(-2)}
            </span>
          </p>
          {stats.leagueStats ? (
            <>
              <div className="mt-3 grid grid-cols-4 gap-px border-t border-line bg-line pt-px">
                {[
                  ["Goals per game", num(stats.leagueStats.avgGoals)],
                  ["Home goals", num(stats.leagueStats.homeGoalsAvg)],
                  ["Away goals", num(stats.leagueStats.awayGoalsAvg)],
                  ["Both scored", pct(stats.leagueStats.bttsRate)],
                  ["Over 0.5", pct(stats.leagueStats.over05Rate)],
                  ["Over 1.5", pct(stats.leagueStats.over15Rate)],
                  ["Over 2.5", pct(stats.leagueStats.over25Rate)],
                  ["Over 3.5", pct(stats.leagueStats.over35Rate)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-ink py-2.5 text-center">
                    <p className="font-mono text-[14px] tnum">{v}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{k}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 font-mono text-[11px] text-faint">
                Historical · {stats.leagueStats.matches} league matches this season
                {stats.leagueStats.dataAsOf ? ` · to ${stats.leagueStats.dataAsOf.slice(0, 10)}` : ""}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-muted">League-wide figures were not needed for your rules, or are not available.</p>
          )}
        </section>
      )}

      {/* Head-to-head */}
      {stats.h2h && (
        <section>
          <p className="kicker">Previous meetings</p>
          {stats.h2h.meetings.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted">No previous meetings found.</p>
          ) : (
            <>
              <p className="mt-2 text-[13px] text-muted">
                <span className="font-mono text-fg tnum">{num(stats.h2h.meetings.reduce((s, m) => s + m.homeGoals + m.awayGoals, 0) / stats.h2h.meetings.length)}</span> goals per meeting ·{" "}
                <span className="font-mono text-fg tnum">{pct(stats.h2h.meetings.filter((m) => m.homeGoals > 0 && m.awayGoals > 0).length / stats.h2h.meetings.length)}</span> both scored · last {stats.h2h.meetings.length}
              </p>
              <ul className="mt-2 font-mono text-[11px] text-muted">
                {stats.h2h.meetings.map((m, i) => (
                  <li key={i} className="grid grid-cols-[5.5rem_1fr_auto_1fr] items-baseline gap-2 border-t border-line py-1">
                    <span className="tnum">{m.date.slice(0, 10)}</span>
                    <span className="truncate text-right">{m.homeTeam}</span>
                    <span className="text-fg tnum">{m.homeGoals}–{m.awayGoals}</span>
                    <span className="truncate">{m.awayTeam}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {stats.notes && stats.notes.length > 0 && (
        <ul className="space-y-1 border-l-2 border-warn pl-3">
          {stats.notes.map((n) => <li key={n} className="text-[12px] text-warn">{n}</li>)}
        </ul>
      )}

      {/* Raw results */}
      {(stats.home.recent.length > 0 || stats.away.recent.length > 0) && (
        <details className="faq group">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-[12px] text-muted transition-colors hover:text-fg">
            <span className="faq-sign inline-block transition-transform">+</span> Recent results used ({stats.home.recent.length} and {stats.away.recent.length})
          </summary>
          <div className="mt-3 grid gap-6 sm:grid-cols-2">
            {(["home", "away"] as const).map((side) => (
              <ul key={side} className="font-mono text-[11px] text-muted">
                <li className="kicker pb-1">{stats[side].resolution.team?.name ?? side}</li>
                {stats[side].recent.map((r) => (
                  <li key={r.fixtureId} className="grid grid-cols-[5.5rem_1fr_auto] gap-2 border-t border-line py-1">
                    <span className="tnum">{r.date.slice(0, 10)}</span>
                    <span className="truncate">{r.venue === "home" ? "vs" : "at"} {r.opponent}</span>
                    <span className={cn("tnum", r.goalsFor > r.goalsAgainst ? "text-accent" : r.goalsFor < r.goalsAgainst ? "text-danger" : "text-fg")}>
                      {r.goalsFor}–{r.goalsAgainst}
                    </span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </details>
      )}

      <p className="border-t border-line pt-3 font-mono text-[11px] text-faint">
        Match data retrieved {new Date(stats.fetchedAt).toLocaleString()}
        {stats.home.dataAsOf ? ` · home data to ${stats.home.dataAsOf.slice(0, 10)}` : ""}
        {stats.away.dataAsOf ? ` · away data to ${stats.away.dataAsOf.slice(0, 10)}` : ""}
      </p>
    </div>
  );
}
