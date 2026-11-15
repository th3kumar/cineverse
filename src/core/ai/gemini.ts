import { fetchJson, type FetchLike } from "../infra/http";
import type { CompletionRequest } from "../ports";
import { BaseAIProvider } from "./base";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** Google Gemini via the native REST API (no SDK needed). */
export class GeminiProvider extends BaseAIProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta",
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    super();
  }

  async complete(req: CompletionRequest): Promise<string> {
    const body = {
      ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
      contents: req.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    };
    const res = await fetchJson<GeminiResponse>(
      `${this.baseUrl}/models/${this.model}:generateContent`,
      { method: "POST", headers: { "x-goog-api-key": this.apiKey }, body },
      this.fetchImpl,
    );
    const text = res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) {
      throw new Error(
        `Gemini returned no text (${res.promptFeedback?.blockReason ?? res.candidates?.[0]?.finishReason ?? "unknown"})`,
      );
    }
    return text;
  }
}
