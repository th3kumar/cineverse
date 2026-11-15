import { z } from "zod";
import type { AIProvider, CompletionRequest, JsonRequest } from "../ports";

export class AIOutputError extends Error {}

/**
 * Shared JSON logic so every vendor adapter only implements `complete()`.
 * Strategy that works on every LLM: put the JSON Schema in the system prompt,
 * use the vendor's native JSON mode when available, validate with zod, and
 * re-ask once with the validation error if the output is wrong.
 */
export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string;
  abstract readonly model: string;
  abstract complete(req: CompletionRequest): Promise<string>;

  async completeJSON<T>(req: JsonRequest<T>): Promise<T> {
    const { schema, retries = 1, ...rest } = req;
    const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
    const system = [
      rest.system,
      "Respond with ONLY valid JSON (no markdown, no prose) matching this JSON Schema:",
      jsonSchema,
    ]
      .filter(Boolean)
      .join("\n\n");

    let messages = rest.messages;
    let lastError = "";
    for (let attempt = 0; attempt <= retries; attempt++) {
      const raw = await this.complete({ ...rest, system, messages, json: true });
      const parsed = safeParseJson(raw);
      if (parsed.ok) {
        const result = schema.safeParse(parsed.value);
        if (result.success) return result.data;
        lastError = z.prettifyError(result.error);
      } else {
        lastError = parsed.error;
      }
      messages = [
        ...messages,
        { role: "assistant", content: raw },
        { role: "user", content: `That was invalid: ${lastError}\nReturn corrected JSON only.` },
      ];
    }
    throw new AIOutputError(`${this.name} returned invalid JSON after ${retries + 1} attempts: ${lastError}`);
  }
}

/** Tolerates ```json fences and leading/trailing prose that some models add. */
export function safeParseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let text = (fenced ? fenced[1] : raw).trim();
  const start = text.search(/[[{]/);
  if (start > 0) text = text.slice(start);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (end >= 0) text = text.slice(0, end + 1);
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: `Not JSON (${(e as Error).message})` };
  }
}
