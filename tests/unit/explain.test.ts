import { describe, expect, it } from "vitest";
import type { Decision, Evidence, Fixture } from "@/lib/domain/schemas";
import { answerSummary, countOutcome, describeEvidence, explainDecision, reviewReason } from "@/lib/explain";

// MOCK DATA: synthetic evidence for isolated unit tests of the wording layer only.
function ev(p: Partial<Evidence>): Evidence {
  return {
    metric: "h2h_avg_goals",
    label: "Head-to-head average goals",
    subject: "Leeds v Derby",
    value: 2,
    display: "2.00",
    comparator: "<=",
    threshold: 2.5,
    passed: true,
    source: "historical_match_data",
    sampleSize: 9,
    basis: "previous meetings",
    rule: "remove",
    ...p,
  };
}

function dec(p: Partial<Decision>): Decision {
  return { fixtureId: "f1", decision: "REMOVE", engineDecision: "REMOVE", overridden: false, reason: "Removed: rule met.", evidence: [], confidence: 1, missingData: [], ...p };
}

describe("describeEvidence", () => {
  it("describes head-to-head and team figures in plain words", () => {
    expect(describeEvidence(ev({}))).toBe("their last 9 meetings averaged 2.00 goals");
    expect(describeEvidence(ev({ sampleSize: 1 }))).toBe("their last 1 meeting averaged 2.00 goals");
    expect(
      describeEvidence(ev({ metric: "failed_to_score_rate", subject: "away: Derby", value: 0.5, basis: "away games, last 6", sampleSize: 6 })),
    ).toBe("Derby failed to score in 50% of its last 6 away games");
  });

  it("returns nothing when there is no value (never invents a figure)", () => {
    expect(describeEvidence(ev({ value: null }))).toBeNull();
  });
});

describe("explainDecision", () => {
  it("explains a removal with the evidence that met the rule", () => {
    expect(explainDecision(dec({ evidence: [ev({})] }), { mode: "remove_matching" })).toBe(
      "Their last 9 meetings averaged 2.00 goals, meeting your threshold of at most 2.50.",
    );
  });

  it("explains a kept match by the rule it did not meet", () => {
    const d = dec({ decision: "KEEP", engineDecision: "KEEP", evidence: [ev({ value: 3.1, display: "3.10", passed: false })] });
    expect(explainDecision(d, { mode: "remove_matching" })).toBe(
      "Their last 9 meetings averaged 3.10 goals, so it does not meet your threshold of at most 2.50.",
    );
  });

  it("explains a keep exception", () => {
    const d = dec({
      decision: "KEEP",
      engineDecision: "KEEP",
      evidence: [ev({}), ev({ metric: "btts_rate", subject: "home: Leeds", value: 0.7, basis: "home games, last 10", sampleSize: 10, comparator: ">=", threshold: 0.6, rule: "keep" })],
    });
    expect(explainDecision(d, { mode: "remove_matching" })).toBe(
      "Kept as an exception: both teams scored in 70% of Leeds's last 10 home games, meeting your threshold of at least 60%.",
    );
  });

  it("uses plain review reasons and respects manual choices", () => {
    const review = dec({ decision: "NEEDS_REVIEW", engineDecision: "NEEDS_REVIEW", missingData: ["Rangers could not be reliably identified (ambiguous)."] });
    expect(explainDecision(review, null)).toBe("Rangers matches several clubs, so FenaFilter could not tell which one is meant.");
    expect(reviewReason(dec({ missingData: ["Only 2 recent home games found for Leeds (need 4)."] }))).toBe(
      "Only 2 recent home games found for Leeds — at least 4 are needed for a fair judgement.",
    );
    expect(explainDecision(review, null, "REMOVE")).toBe("You chose to remove this match.");
    expect(explainDecision(dec({ overridden: true, decision: "KEEP" }), null, "KEEP")).toBe("You chose to keep this match.");
  });
});

describe("answerSummary", () => {
  const fx = (id: string, competition: string | null, excluded = false) => ({ id, competition, excluded }) as unknown as Fixture;
  const fixtures = [fx("a", "Premier League"), fx("b", "Premier League"), fx("c", "La Liga"), fx("d", "Serie A", true)];
  const decisions = ["a", "b", "c", "d"].map((id) => dec({ fixtureId: id }));
  const leagueOf = (f: Fixture) => f.competition ?? null;

  it("counts only active fixtures and leagues", () => {
    const c = countOutcome(fixtures, decisions, { a: "KEEP", b: "REMOVE", c: "NEEDS_REVIEW", d: "REMOVE" }, leagueOf);
    expect(c).toEqual({ total: 3, kept: 1, removed: 1, review: 1, leagues: ["Premier League", "La Liga"] });
    expect(answerSummary(c)).toBe(
      "FenaFilter analyzed 3 matches across 2 competitions. 1 match passes your playbook, 1 was removed and 1 needs a closer look. Matches that need a closer look stay in your screenshot until you decide.",
    );
  });

  it("says nothing was cut when nothing was removed", () => {
    expect(answerSummary({ total: 2, kept: 2, removed: 0, review: 0, leagues: ["La Liga"] })).toBe(
      "FenaFilter analyzed 2 matches from La Liga. 2 matches pass your playbook. Nothing was cut from your screenshot.",
    );
  });

  it("handles all removed, plural review and empty results", () => {
    expect(answerSummary({ total: 4, kept: 0, removed: 4, review: 0, leagues: [] })).toBe("FenaFilter analyzed 4 matches. 4 were removed.");
    expect(answerSummary({ total: 5, kept: 2, removed: 1, review: 2, leagues: [] })).toContain("2 need a closer look");
    expect(answerSummary({ total: 6, kept: 0, removed: 0, review: 6, leagues: [] })).toBe(
      "FenaFilter analyzed 6 matches. 6 need a closer look. Nothing was cut from your screenshot: matches that need a closer look stay in until you decide.",
    );
    expect(answerSummary({ total: 0, kept: 0, removed: 0, review: 0, leagues: [] })).toBe("No matches were analyzed.");
  });
});
