import { describe, expect, it } from "vitest";
import { toGeminiRequest } from "@/lib/ai/gemini-messages";

describe("toGeminiRequest", () => {
  it("moves system prompts to systemInstruction and maps assistant to model", () => {
    const r = toGeminiRequest([
      { role: "system", content: "rules" },
      { role: "user", content: "instruction" },
      { role: "assistant", content: "bad json" },
      { role: "user", content: "fix it" },
    ]);
    expect(r.systemInstruction).toBe("rules");
    expect(r.contents).toEqual([
      { role: "user", parts: [{ text: "instruction" }] },
      { role: "model", parts: [{ text: "bad json" }] },
      { role: "user", parts: [{ text: "fix it" }] },
    ]);
  });

  it("merges consecutive same-role messages so turns alternate", () => {
    const r = toGeminiRequest([
      { role: "user", content: "a" },
      { role: "user", content: "b" },
    ]);
    expect(r.systemInstruction).toBeUndefined();
    expect(r.contents).toEqual([{ role: "user", parts: [{ text: "a" }, { text: "b" }] }]);
  });
});
