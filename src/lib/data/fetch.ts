/**
 * Fetch wrapper with timeout and retry support.
 * Used by data source clients for reliable API access.
 */

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

/** Default timeout for most external API calls. */
const DEFAULT_TIMEOUT = 8000;
const MAX_RETRIES = 1;

export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT, retries = MAX_RETRIES, headers = {} } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok || attempt === retries) return res;

      // Non-ok response: retry on 5xx, don't retry on 4xx
      if (res.status < 500) return res;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }

    // Exponential backoff before retry
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
    }
  }

  throw lastError ?? new Error("Fetch failed after retries");
}
