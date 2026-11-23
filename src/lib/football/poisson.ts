import { type TeamProfile, venueSplit } from "./stats";

/**
 * POISSON GOAL MODEL — methodology (also shown to users on the results page)
 *
 * 1. Expected goals for each side:
 *      λ_home = mean( home team's avg goals scored at home,
 *                     away team's avg goals conceded away )
 *      λ_away = mean( away team's avg goals scored away,
 *                     home team's avg goals conceded at home )
 *    If a team has fewer than 3 games at the relevant venue, its overall
 *    average is used instead.
 *
 * 2. Shrinkage: small samples are noisy, so each λ is pulled toward a
 *    generic prior (1.45 home / 1.15 away goals, typical of top European
 *    leagues) with a weight equivalent to 4 matches:
 *      λ = (n·λ_obs + 4·prior) / (n + 4)
 *
 * 3. Goals for each side are modelled as independent Poisson variables.
 *    P(k goals) = e^-λ · λ^k / k!. Match probabilities are summed over the
 *    joint score grid 0..10 × 0..10.
 *
 * Limitations: independence ignores game-state effects, the prior is not
 * league-specific, and recent form is weighted equally. Outputs are
 * ESTIMATES derived from historical frequencies, not guarantees.
 */

export const PRIOR_HOME = 1.45;
export const PRIOR_AWAY = 1.15;
export const PRIOR_WEIGHT = 4;
const MAX_GOALS = 10;

export interface MatchEstimate {
  lambdaHome: number;
  lambdaAway: number;
  sampleHome: number;
  sampleAway: number;
  pHomeScores: number;
  pAwayScores: number;
  pHomeCleanSheet: number;
  pAwayCleanSheet: number;
  pHomeWin: number;
  pDraw: number;
  pAwayWin: number;
  pHomeWinToNil: number;
  pAwayWinToNil: number;
  pBtts: number;
  /** P(total goals = k) for k = 0..MAX_GOALS*2 */
  totalGoalsDist: number[];
  notes: string[];
}

export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function shrink(observed: number, n: number, prior: number) {
  return (n * observed + PRIOR_WEIGHT * prior) / (n + PRIOR_WEIGHT);
}

/**
 * League priors: when the fixture's league has enough finished matches this
 * season, its real home/away goal averages replace the generic prior. This is
 * what makes the estimate league-aware (e.g. a low-scoring league pulls
 * expectations down) without inventing any figures.
 */
export interface LeaguePriors {
  home: number;
  away: number;
  label: string;
}

export function estimateMatch(home: TeamProfile, away: TeamProfile, priors?: LeaguePriors | null): MatchEstimate | null {
  const h = venueSplit(home, "home");
  const a = venueSplit(away, "away");
  if (h.split.avgFor === null || h.split.avgAgainst === null || a.split.avgFor === null || a.split.avgAgainst === null) {
    return null;
  }
  const notes: string[] = [];
  if (!h.usedVenue) notes.push("Home team has few home games in the sample; overall averages used.");
  if (!a.usedVenue) notes.push("Away team has few away games in the sample; overall averages used.");

  const rawHome = (h.split.avgFor + a.split.avgAgainst) / 2;
  const rawAway = (a.split.avgFor + h.split.avgAgainst) / 2;
  const nHome = Math.min(h.split.played, a.split.played);
  const nAway = Math.min(a.split.played, h.split.played);
  const lambdaHome = shrink(rawHome, nHome, priors?.home ?? PRIOR_HOME);
  const lambdaAway = shrink(rawAway, nAway, priors?.away ?? PRIOR_AWAY);
  notes.push(priors ? `Adjusted towards ${priors.label} averages.` : "Adjusted towards a typical league average (league figures not available).");
  return fromLambdas(lambdaHome, lambdaAway, nHome, nAway, notes);
}

export function fromLambdas(lambdaHome: number, lambdaAway: number, sampleHome = 0, sampleAway = 0, notes: string[] = []): MatchEstimate {
  const ph = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poissonPmf(k, lambdaHome));
  const pa = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poissonPmf(k, lambdaAway));
  let pHomeWin = 0, pDraw = 0, pAwayWin = 0, pHomeWinToNil = 0, pAwayWinToNil = 0;
  const total = new Array(MAX_GOALS * 2 + 1).fill(0) as number[];
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = ph[i]! * pa[j]!;
      total[i + j]! += p;
      if (i > j) {
        pHomeWin += p;
        if (j === 0) pHomeWinToNil += p;
      } else if (i === j) pDraw += p;
      else {
        pAwayWin += p;
        if (i === 0) pAwayWinToNil += p;
      }
    }
  }
  const pHomeScores = 1 - ph[0]!;
  const pAwayScores = 1 - pa[0]!;
  return {
    lambdaHome,
    lambdaAway,
    sampleHome,
    sampleAway,
    pHomeScores,
    pAwayScores,
    pHomeCleanSheet: pa[0]!,
    pAwayCleanSheet: ph[0]!,
    pHomeWin,
    pDraw,
    pAwayWin,
    pHomeWinToNil,
    pAwayWinToNil,
    pBtts: pHomeScores * pAwayScores,
    totalGoalsDist: total,
    notes,
  };
}

/** P(total goals > line), e.g. line 2.5 → P(total >= 3). */
export function probOver(est: MatchEstimate, line: number): number {
  const threshold = Math.floor(line) + 1;
  let p = 0;
  for (let k = threshold; k < est.totalGoalsDist.length; k++) p += est.totalGoalsDist[k]!;
  return p;
}

export function probUnder(est: MatchEstimate, line: number): number {
  return 1 - probOver(est, line);
}
