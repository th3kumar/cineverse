import { fetchJson, type FetchLike } from "../infra/http";
import type { CompletionRequest } from "../ports";
import { BaseAIProvider } from "./base";

interface MessagesResponse {
  content?: { type: string; text?: string }[];
}

/** Anthropic Claude via the Messages REST API. JSON is enforced by the shared prompt + zod validation. */
export class AnthropicProvider extends BaseAIProvider {
  readonly name = "anthropic";

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly baseUrl = "https://api.anthropic.com/v1",
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    super();
  }

  async complete(req: CompletionRequest): Promise<string> {
    const res = await fetchJson<MessagesResponse>(
      `${this.baseUrl}/messages`,
      {
        method: "POST",
        headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
        body: {
          model: this.model,
          max_tokens: 2048,
          temperature: req.temperature ?? 0.7,
          ...(req.system ? { system: req.system } : {}),
          messages: req.messages,
        },
      },
      this.fetchImpl,
    );
    const text = (res.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    if (!text) throw new Error("anthropic returned no text");
    return text;
  }
}
