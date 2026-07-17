/**
 * API Key management — client facade over the server-side key store.
 *
 * SECURITY MODEL (D1 fix):
 * - Keys live ONLY in an AES-256-GCM encrypted HttpOnly cookie, written by
 *   PUT /api/settings/keys. Client JavaScript can never read key material.
 * - This module exposes configuration STATUS (configured + masked tail) and
 *   proxies save/clear/test operations to the server.
 * - Server API routes resolve keys in order: env vars → cookie → request body.
 */

export type APIKeyRecord = Record<string, string>;

export interface ProviderKeyStatus {
  configured: boolean;
  masked: string | null;
}

export type KeyStatusMap = Record<string, ProviderKeyStatus>;

/** Fetch per-provider configuration status (never the key itself). */
export async function fetchKeyStatus(): Promise<KeyStatusMap> {
  try {
    const res = await fetch("/api/settings/keys", { cache: "no-store" });
    const j = await res.json();
    if (j.success && j.data?.providers) return j.data.providers as KeyStatusMap;
  } catch {}
  return {};
}

/** Save keys server-side. Pass "" for a provider to remove that key. */
export async function saveAPIKeys(keys: APIKeyRecord): Promise<boolean> {
  try {
    const res = await fetch("/api/settings/keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys }),
    });
    const j = await res.json();
    return Boolean(j.success);
  } catch {
    return false;
  }
}

/** Remove all stored keys. */
export async function clearAPIKeys(): Promise<void> {
  try {
    await fetch("/api/settings/keys", { method: "DELETE" });
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

/**
 * Test an API key. When `key` is omitted, the server tests the key already
 * stored in the encrypted cookie for that provider.
 */
export async function testAPIKey(provider: string, key?: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch("/api/ai/test-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(key ? { provider, key } : { provider }),
    });
    const j = await res.json();
    return j;
  } catch {
    return { valid: false, error: "网络错误：无法连接到验证服务" };
  }
}
