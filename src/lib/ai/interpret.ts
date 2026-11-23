import "server-only";
import { logError } from "../errors";
import { geminiChat } from "./gemini";
import { parseInstruction, type ParseResult } from "./instruction-parser";

/** Interpret a filtering instruction with the AI model (JSON output, then validated). */
export async function interpretInstruction(instruction: string): Promise<ParseResult> {
  const result = await parseInstruction(instruction, (messages) => geminiChat(messages, { json: true, temperature: 0 }));
  if (result.detail) logError("instruction interpretation", new Error(result.detail));
  return result;
}
