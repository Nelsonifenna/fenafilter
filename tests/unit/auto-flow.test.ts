import { describe, expect, it } from "vitest";
import type { FilterPlan, Fixture, Job } from "@/lib/domain/schemas";
import { evaluateFixture, fixtureUnreadable } from "@/lib/filtering/engine";
import { continueOrAsk } from "@/lib/jobs/pipeline";
import { initialSteps } from "@/lib/jobs/repository";

// MOCK DATA for isolated tests: a job just after the screenshot was read.

const plan: FilterPlan = {
  status: "ok", clarificationQuestion: null, mode: "remove_matching",
  removeWhen: { kind: "team", teams: ["Kingsford"], subject: "either" }, keepWhen: null,
  summary: "Remove matches involving Kingsford.", assumptions: [], unsupported: [],
};
const fx = (id: number, home: string, away: string, extra: Partial<Fixture> = {}): Fixture => ({
  id: `match_${String(id).padStart(3, "0")}`, homeTeam: home, awayTeam: away, competition: null, date: null, kickoff: null, odds: [],
  confidence: 0.95, box: { x: 0, y: id * 100, width: 400, height: 80 }, issues: [], userEdited: false, excluded: false, ...extra,
});
function job(fixtures: Fixture[], p: FilterPlan | null, planError: string | null = null): Job {
  return {
    id: "a".repeat(24), ownerId: "b".repeat(32), version: 1, createdAt: "", updatedAt: "", expiresAt: "", status: "EXTRACTING", error: null,
    image: { key: "k", contentType: "image/png", width: 400, height: 800, sizeBytes: 1, originalName: "x.png" },
    instruction: "x", steps: initialSteps(),
    extraction: { model: "MOCK", layout: "list", isFootballImage: true, imageWidth: 400, imageHeight: 800, tiles: 1, fixtures, warnings: [] },
    plan: p, planError, fixturesConfirmed: false, stats: {}, decisions: null, summary: null, output: null, lease: null, retry: null,
  };
}
const active = (j: Job) => j.steps.filter((s) => s.state === "active").map((s) => s.id);

describe("automatic continuation after reading the screenshot", () => {
  it("continues straight to statistics when the matches were read and the rules are clear", () => {
    const j = continueOrAsk(job([fx(1, "Northbridge", "Eastvale"), fx(2, "Harbour City", "Kingsford")], plan));
    expect(j.status).toBe("FETCHING_STATISTICS");
    expect(j.fixturesConfirmed).toBe(true);
    expect(active(j)).toEqual(["stats"]); // exactly one live stage
    expect(j.steps.find((s) => s.id === "interpret")?.state).toBe("done");
  });

  it("still continues when individual rows are unreadable (they become Review, not a stop)", () => {
    const j = continueOrAsk(job([fx(1, "Northbridge", "Eastvale"), fx(2, "", "Kingsford", { issues: ["A team name could not be read."] })], plan));
    expect(j.status).toBe("FETCHING_STATISTICS");
  });

  it("asks only when the instruction needs clarification", () => {
    const j = continueOrAsk(job([fx(1, "A", "B")], { ...plan, status: "needs_clarification", clarificationQuestion: "Keep or remove?" }));
    expect(j.status).toBe("AWAITING_CONFIRMATION");
    expect(j.steps.find((s) => s.id === "interpret")?.state).toBe("waiting");
  });

  it("asks only when the instruction could not be interpreted at all", () => {
    expect(continueOrAsk(job([fx(1, "A", "B")], null, "Could not translate")).status).toBe("AWAITING_CONFIRMATION");
  });

  it("asks only when no matches could be read", () => {
    expect(continueOrAsk(job([], plan)).status).toBe("AWAITING_CONFIRMATION");
    expect(continueOrAsk(job([fx(1, "A", "B", { excluded: true })], plan)).status).toBe("AWAITING_CONFIRMATION");
  });

  it("uses the new, single-stage progress steps", () => {
    expect(initialSteps().map((s) => s.label)).toEqual([
      "Uploading screenshot", "Reading matches", "Applying your playbook", "Identifying teams and fetching statistics", "Filtering matches", "Preparing image",
    ]);
  });
});

describe("unreadable rows", () => {
  it("are detected from missing names or reading issues", () => {
    expect(fixtureUnreadable(fx(1, "", "B"))).toBe(true);
    expect(fixtureUnreadable(fx(1, "A", "B", { issues: ["Text is partly unreadable (blurred, small or cut off)."] }))).toBe(true);
    expect(fixtureUnreadable(fx(1, "A", "B", { issues: ["Low extraction confidence; please verify the team names."] }))).toBe(false);
    expect(fixtureUnreadable(fx(1, "A", "B"))).toBe(false);
  });

  it("are never filtered automatically — they go to Review with a clear reason", () => {
    const d = evaluateFixture(fx(1, "", "Kingsford", { issues: ["A team name could not be read."] }), plan, null);
    expect(d.decision).toBe("NEEDS_REVIEW");
    expect(d.reason).toMatch(/could not be read reliably/);
  });
});
