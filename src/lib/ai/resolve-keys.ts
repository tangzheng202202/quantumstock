/**
 * Server-side API key resolution for AI providers.
 *
 * Priority:
 *   1. Server environment variables (platform keys — preferred for SaaS)
 *   2. User's encrypted keys stored in DB (BYOK, AES-256-GCM via ENCRYPTION_KEY)
 *
 * Client-sent plaintext keys are NO LONGER accepted (P0-1 fix).
 */

import type { AIProvider } from "@/types";
import { prisma, hasDatabase } from "@/lib/db/prisma";
import { decryptApiKey, maskApiKey } from "@/lib/db/repositories/api-key-repo";

export type ProviderKeyMap = Record<AIProvider, string>;

const ENV_KEYS: Record<AIProvider, string | undefined> = {
  claude: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY,
  minimax: process.env.MINIMAX_API_KEY,
  local: undefined,
};

function envKeys(): ProviderKeyMap {
  return {
    claude: process.env.ANTHROPIC_API_KEY ?? "",
    openai: process.env.OPENAI_API_KEY ?? "",
    deepseek: process.env.DEEPSEEK_API_KEY ?? "",
    minimax: process.env.MINIMAX_API_KEY ?? "",
    local: "",
  };
}

/**
 * Resolve usable API keys for a user (or anonymous → env only).
 * Env keys always win; DB keys fill the gaps for providers the platform
 * doesn't configure (BYOK).
 */
export async function resolveApiKeys(userId?: string | null): Promise<ProviderKeyMap> {
  const keys = envKeys();

  if (!userId || !hasDatabase || !prisma) return keys;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { apiKeys: true },
    });
    if (!user) return keys;

    for (const rec of user.apiKeys) {
      if (!rec.keyEnc) continue;
      if (keys[rec.provider as AIProvider]) continue; // env wins
      const plain = await decryptApiKey(rec.keyEnc);
      if (plain) keys[rec.provider as AIProvider] = plain;
    }
  } catch {
    // DB failure → fall back to env-only keys
  }
  return keys;
}

/** Providers configured either via env or (with ENCRYPTION_KEY + DB) BYOK. */
export function byokEnabled(): boolean {
  return hasDatabase && !!process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 32;
}

export { maskApiKey };
