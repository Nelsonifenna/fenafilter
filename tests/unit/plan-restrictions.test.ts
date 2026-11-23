import { describe, expect, it } from "vitest";
import { FootballApiError, planRestrictionKey } from "@/lib/football/api-football";

// Exact messages returned by the statistics provider on the free plan (verified live, Nov 2026).
describe("plan restriction detection", () => {
  it("recognises the blocked 'last' parameter", () => {
    expect(planRestrictionKey(new FootballApiError("Free plans do not have access to the Last parameter.", "plan"))).toBe("param:last");
  });
  it("recognises a blocked season", () => {
    expect(planRestrictionKey(new FootballApiError("Free plans do not have access to this season, try from 2022 to 2024.", "plan"), 2026)).toBe("season:2026");
  });
  it("ignores non-plan errors", () => {
    expect(planRestrictionKey(new FootballApiError("API-Football HTTP 500", "http"), 2026)).toBeNull();
  });
});
