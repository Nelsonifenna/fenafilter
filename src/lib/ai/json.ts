/**
 * Robustly pull a JSON object out of a model response.
 *
 * Even with JSON output mode, model responses can include ``` fences, prose or
 * <think>…</think> blocks. We never trust the raw text: we extract, parse,
 * then schema-validate.
 */
export function extractJsonObject(text: string): unknown {
  if (!text) throw new Error("Empty model response");
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Unclosed think block: drop everything up to the last closing tag if present.
  if (/<think>/i.test(t)) t = t.slice(t.toLowerCase().lastIndexOf("</think>") + 8);

  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* fall through */
    }
  }
  const start = t.indexOf("{");
  if (start === -1) throw new Error("No JSON object in model response");
  // Scan for the matching closing brace, respecting strings.
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(t.slice(start, i + 1));
    }
  }
  throw new Error("Unterminated JSON object in model response");
}
