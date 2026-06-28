/**
 * API Key storage utility.
 *
 * SECURITY MODEL (P0-2):
 * - Server-side: API Keys stored as environment variables (process.env.*_API_KEY)
 * - Client-side: localStorage retains keys for convenience on personal devices,
 *   but settings page now displays a prominent security warning.
 * - The /api/ai/analyze route prioritizes server env vars over client-sent keys.
 */

const STORAGE_KEY = "quantumstock:api-keys";

export type APIKeyRecord = Record<string, string>;

export function saveAPIKeys(keys: APIKeyRecord): void {
  try {
    const json = JSON.stringify(keys);
    const encoded = btoa(json);
    localStorage.setItem(STORAGE_KEY, encoded);
  } catch {}
}

export function loadAPIKeys(): APIKeyRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const json = atob(raw);
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export function clearAPIKeys(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * Validate API key format by provider.
 * Returns true if the key matches the expected pattern.
 */
export function validateKeyFormat(provider: string, key: string): boolean {
  if (!key || key.length < 10) return false;
  const patterns: Record<string, RegExp> = {
    claude: /^sk-ant-[a-zA-Z0-9_-]{20,}$/,
    openai: /^sk-(proj-)?[a-zA-Z0-9_-]{20,}$/,
    deepseek: /^sk-[a-zA-Z0-9]{20,}$/,
  };
  const pattern = patterns[provider];
  if (!pattern) return key.length > 10; // Unknown provider: lenient
  return pattern.test(key);
}

export async function testAPIKey(provider: string, key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch("/api/ai/test-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, key }),
    });
    const j = await res.json();
    return j;
  } catch {
    return { valid: false, error: "网络错误：无法连接到验证服务" };
  }
}
