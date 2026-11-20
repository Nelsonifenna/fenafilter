/**
 * Pure conversion from chat-style messages to a Gemini request.
 * Gemini takes the system prompt separately (systemInstruction) and uses the
 * role "model" for assistant turns.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

export function toGeminiRequest(messages: ChatMessage[]): { systemInstruction: string | undefined; contents: GeminiContent[] } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content);
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const role = m.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    // Gemini expects alternating turns; merge consecutive messages with the same role.
    if (last && last.role === role) last.parts.push({ text: m.content });
    else contents.push({ role, parts: [{ text: m.content }] });
  }
  return { systemInstruction: system.length ? system.join("\n\n") : undefined, contents };
}
