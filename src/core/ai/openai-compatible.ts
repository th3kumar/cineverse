import { fetchJson, type FetchLike } from "../infra/http";
import type { CompletionRequest } from "../ports";
import { BaseAIProvider } from "./base";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

/**
 * One adapter for every vendor that speaks the OpenAI Chat Completions format:
 * OpenAI, Groq, OpenRouter, Together, DeepSeek, Mistral, local Ollama / LM Studio, etc.
 * Only the base URL, key and model change.
 */
export class OpenAICompatibleProvider extends BaseAIProvider {
  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    readonly model: string,
    /** Some compatible servers reject `response_format`; set false to rely on the prompt only. */
    private readonly nativeJson = true,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    super();
  }

  async complete(req: CompletionRequest): Promise<string> {
    const messages = [
      ...(req.system ? [{ role: "system", content: req.system }] : []),
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const res = await fetchJson<ChatCompletionResponse>(
      `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
        body: {
          model: this.model,
          messages,
          temperature: req.temperature ?? 0.7,
          ...(req.json && this.nativeJson ? { response_format: { type: "json_object" } } : {}),
        },
      },
      this.fetchImpl,
    );
    const text = res.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error(`${this.name} returned an empty completion`);
    return text;
  }
}

/** Known OpenAI-compatible endpoints, selectable by AI_PROVIDER. */
export const OPENAI_COMPATIBLE_PRESETS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1",
};
