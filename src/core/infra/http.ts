export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status} from ${redact(url)}: ${body.slice(0, 300)}`);
  }
}

/** Strip key-like query params so secrets never land in logs or error messages. */
export function redact(url: string): string {
  return url.replace(/([?&](?:key|api_key|apiKey)=)[^&]+/gi, "$1***");
}

export interface FetchJsonOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Retries on network errors, 429 and 5xx. Default 1. */
  retries?: number;
}

export type FetchLike = typeof fetch;

export async function fetchJson<T = unknown>(
  url: string,
  opts: FetchJsonOptions = {},
  fetchImpl: FetchLike = fetch,
): Promise<T> {
  const { method = "GET", headers = {}, body, timeoutMs = 15_000, retries = 1 } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method,
        headers: body !== undefined ? { "content-type": "application/json", ...headers } : headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new HttpError(res.status, url, text);
        if (res.status === 429 || res.status >= 500) {
          lastErr = err;
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw err;
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof HttpError && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
      if (attempt < retries) await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
