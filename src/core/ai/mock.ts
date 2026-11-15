import type { CompletionRequest } from "../ports";
import { BaseAIProvider } from "./base";

/**
 * Offline AI for development and tests. Returns a fixed set of picks, including one
 * made-up title so you can see the hallucination guard drop it.
 */
export class MockAIProvider extends BaseAIProvider {
  readonly name = "mock";
  readonly model = "mock-1";

  async complete(req: CompletionRequest): Promise<string> {
    const ask = req.messages.at(-1)?.content.toLowerCase() ?? "";
    const horror = /horror|scary|vampire|silent/.test(ask);
    const picks = horror
      ? [
          { title: "Nosferatu", year: 1922, reason: "The original vampire classic, public domain." },
          { title: "Night of the Living Dead", year: 1968, reason: "Low-budget zombie landmark." },
          { title: "The Phantom Carriage", year: 1921, reason: "Eerie Swedish silent ghost story." },
        ]
      : [
          { title: "Shutter Island", year: 2010, reason: "Unreliable narrator and a twist that reframes everything." },
          { title: "Prisoners", year: 2013, reason: "Slow-burn moral thriller with relentless tension." },
          { title: "Gone Girl", year: 2014, reason: "Twisty marriage-as-mystery story." },
          { title: "The Midnight Lighthouse Paradox", year: 2019, reason: "(made-up title — should be filtered out)" },
          { title: "Metropolis", year: 1927, reason: "Silent sci-fi, free to watch." },
        ];
    return req.json ? JSON.stringify({ recommendations: picks }) : picks.map((p) => p.title).join(", ");
  }
}
