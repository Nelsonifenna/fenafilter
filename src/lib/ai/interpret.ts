import "server-only";
import { geminiChat } from "./gemini";
import { parseInstruction, type ParseResult } from "./instruction-parser";

/** Interpret a filtering instruction with Google Gemini (JSON output, then validated). */
export function interpretInstruction(instruction: string): Promise<ParseResult> {
  return parseInstruction(instruction, (messages) => geminiChat(messages, { json: true, temperature: 0 }));
}
