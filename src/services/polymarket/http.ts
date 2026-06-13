// Minimal fetch wrapper for Polymarket public APIs.
// Adds timeout, retry-with-backoff on 429/5xx, and typed errors.

export class PolymarketError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "PolymarketError";
    this.status = status;
  }
}

export class NotFoundError extends PolymarketError {
  constructor(message = "Not found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends PolymarketError {
  constructor(message = "Rate limited") {
    super(message, 429);
    this.name = "RateLimitError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchOpts {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

export async function getJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const { timeoutMs = 12_000, retries = 3, signal } = opts;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    if (signal) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }

    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { accept: "application/json", "user-agent": "PolyScope/1.0" },
      });
      clearTimeout(timer);

      if (res.status === 404) throw new NotFoundError();
      if (res.status === 429) {
        if (attempt < retries) {
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
        throw new RateLimitError();
      }
      if (res.status >= 500) {
        if (attempt < retries) {
          await sleep(400 * Math.pow(2, attempt));
          continue;
        }
        throw new PolymarketError(`Upstream ${res.status}`, res.status);
      }
      if (!res.ok) {
        throw new PolymarketError(`HTTP ${res.status}`, res.status);
      }
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err instanceof NotFoundError) throw err;
      if (attempt < retries) {
        await sleep(300 * Math.pow(2, attempt));
        continue;
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new PolymarketError("Unknown fetch error");
}

export function isAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim());
}
