import type { FixtureStats, Job } from "../domain/schemas";
import { buildContext } from "../filtering/engine";
import { probOver } from "../football/poisson";
import type { Split } from "../football/stats";

/**
 * Shapes a job record for the browser: adds image URLs and computed match
 * details, and removes internal fields. Contains no secrets.
 */

export interface SplitView {
  played: number;
  record: string;
  avgFor: number | null;
  avgAgainst: number | null;
  bttsRate: number | null;
  cleanSheetRate: number | null;
  failedToScoreRate: number | null;
  over25Rate: number | null;
}

export interface TeamDetailView {
  name: string;
  form: string;
  formPointsPerGame: number | null;
  overall: SplitView;
  home: SplitView;
  away: SplitView;
}

export interface MatchDetailView {
  fixtureId: string;
  home: TeamDetailView | null;
  away: TeamDetailView | null;
  model: {
    lambdaHome: number;
    lambdaAway: number;
    pHomeScores: number;
    pAwayScores: number;
    pBtts: number;
    pOver25: number;
    pUnder25: number;
    pHomeWin: number;
    pDraw: number;
    pAwayWin: number;
    pHomeCleanSheet: number;
    pAwayCleanSheet: number;
    notes: string[];
  } | null;
}

const splitView = (s: Split): SplitView => ({
  played: s.played,
  record: `${s.wins}W ${s.draws}D ${s.losses}L`,
  avgFor: s.avgFor,
  avgAgainst: s.avgAgainst,
  bttsRate: s.bttsRate,
  cleanSheetRate: s.cleanSheetRate,
  failedToScoreRate: s.failedToScoreRate,
  over25Rate: s.over25Rate,
});

export function toJobView(job: Job) {
  const details: MatchDetailView[] = [];
  if (job.extraction) {
    for (const f of job.extraction.fixtures) {
      const stats = job.stats[f.id];
      if (!stats) continue;
      const ctx = buildContext(f, stats);
      const team = (p: typeof ctx.home, name: string): TeamDetailView | null =>
        p ? { name, form: p.form, formPointsPerGame: p.formPointsPerGame, overall: splitView(p.overall), home: splitView(p.home), away: splitView(p.away) } : null;
      const e = ctx.estimate;
      details.push({
        fixtureId: f.id,
        home: team(ctx.home, stats.home.resolution.team?.name ?? f.homeTeam),
        away: team(ctx.away, stats.away.resolution.team?.name ?? f.awayTeam),
        model: e
          ? {
              lambdaHome: e.lambdaHome,
              lambdaAway: e.lambdaAway,
              pHomeScores: e.pHomeScores,
              pAwayScores: e.pAwayScores,
              pBtts: e.pBtts,
              pOver25: probOver(e, 2.5),
              pUnder25: 1 - probOver(e, 2.5),
              pHomeWin: e.pHomeWin,
              pDraw: e.pDraw,
              pAwayWin: e.pAwayWin,
              pHomeCleanSheet: e.pHomeCleanSheet,
              pAwayCleanSheet: e.pAwayCleanSheet,
              notes: e.notes,
            }
          : null,
      });
    }
  }
  // Strip internal fields: ownership, worker lease, storage keys, AI model names
  // and the data provider's name never leave the server.
  const { ownerId: _owner, lease: _lease, image, extraction, summary, stats, output, ...rest } = job;
  void _owner;
  void _lease;
  const { key: _imageKey, ...publicImage } = image;
  void _imageKey;
  const publicExtraction = extraction ? (({ model: _m, ...x }) => (void _m, x))(extraction) : null;
  const publicOutput = output ? (({ key: _k, ...o }) => (void _k, o))(output) : null;
  const publicStats: Record<string, PublicFixtureStats> = Object.fromEntries(
    Object.entries(stats).map(([id, s]) => [id, (({ source: _s, ...p }) => (void _s, p))(s)]),
  );
  return {
    ...rest,
    image: publicImage,
    extraction: publicExtraction,
    summary: summary ? { text: summary.text } : null,
    stats: publicStats,
    output: publicOutput,
    imageUrl: `/api/image/${job.id}/original`,
    outputUrl: output ? `/api/image/${job.id}/output?v=${encodeURIComponent(output.generatedAt)}` : null,
    details,
  };
}

/** Football statistics as sent to the browser (without the provider's name). */
export type PublicFixtureStats = Omit<FixtureStats, "source">;

export type JobView = ReturnType<typeof toJobView>;

export interface JobSummaryView {
  id: string;
  createdAt: string;
  status: Job["status"];
  instruction: string;
  fixtures: number;
  kept: number;
  removed: number;
  review: number;
  thumbnailUrl: string;
}

export function toJobSummary(job: Job): JobSummaryView {
  const d = job.decisions ?? [];
  return {
    id: job.id,
    createdAt: job.createdAt,
    status: job.status,
    instruction: job.instruction,
    fixtures: job.extraction?.fixtures.length ?? 0,
    kept: d.filter((x) => x.decision === "KEEP").length,
    removed: d.filter((x) => x.decision === "REMOVE").length,
    review: d.filter((x) => x.decision === "NEEDS_REVIEW").length,
    thumbnailUrl: `/api/image/${job.id}/original`,
  };
}
