/**
 * Server-side API key store (D1 security fix).
 *
 * Keys are AES-256-GCM encrypted and stored in an HttpOnly cookie, so
 * client-side JavaScript can never read them — eliminating the XSS theft
 * surface of the previous base64-in-localStorage approach.
 *
 * Cookie:  qs_ai_keys  (HttpOnly, Secure in prod, SameSite=Strict, Path=/api)
 * Crypto:  AES-256-GCM, key derived from KEY_ENCRYPTION_SECRET via scrypt.
 *
 * Key resolution order in API routes:
 *   1. Server environment variables (ANTHROPIC_API_KEY etc.)
 *   2. HttpOnly cookie (user-configured via settings page)
 *   3. Request body apiKeys (legacy / external-script compatibility)
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import type { NextRequest, NextResponse } from "next/server";

export const KEY_COOKIE = "qs_ai_keys";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const SCRYPT_SALT = "quantumstock:ai-keys:v1";

export interface StoredKeys {
  claude?: string;
  openai?: string;
  deepseek?: string;
  minimax?: string;
}

// Per-process fallback key, generated once when no stable secret is set.
let ephemeralKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (secret) return scryptSync(secret, SCRYPT_SALT, 32);
  if (process.env.NODE_ENV === "production") {
    // No stable secret configured: fall back to a per-process random key.
    // Encryption stays fully effective (cookies are unreadable ciphertext),
    // they just don't survive restarts — users re-enter keys. Multi-instance
    // deployments MUST set KEY_ENCRYPTION_SECRET so all nodes share one key.
    if (!ephemeralKey) {
      console.warn(
        "[api-keys] KEY_ENCRYPTION_SECRET not set — using ephemeral per-process key; stored API keys will be invalidated on restart."
      );
      ephemeralKey = randomBytes(32);
    }
    return ephemeralKey;
  }
  // Dev fallback: deterministic key so cookies survive restarts locally.
  return scryptSync("quantumstock-dev-only-secret", SCRYPT_SALT, 32);
}

/** Encrypt a keys record into a compact token: base64url(iv).base64url(ct+tag). */
export function encryptKeys(keys: StoredKeys): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const plaintext = JSON.stringify(keys);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${Buffer.concat([encrypted, tag]).toString("base64url")}`;
}

/** Decrypt a cookie token back into a keys record. Returns null on any failure. */
export function decryptKeys(token: string): StoredKeys | null {
  try {
    const [ivB64, dataB64] = token.split(".");
    if (!ivB64 || !dataB64) return null;
    const iv = Buffer.from(ivB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    const tag = data.subarray(data.length - 16);
    const ciphertext = data.subarray(0, data.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plaintext);
    return typeof parsed === "object" && parsed !== null ? (parsed as StoredKeys) : null;
  } catch {
    return null;
  }
}

/** Read and decrypt the keys cookie from an incoming request. */
export function readKeysFromRequest(req: NextRequest): StoredKeys {
  const raw = req.cookies.get(KEY_COOKIE)?.value;
  if (!raw) return {};
  return decryptKeys(raw) ?? {};
}

/** Attach the encrypted keys cookie to a response. */
export function writeKeysCookie(res: NextResponse, keys: StoredKeys): void {
  res.cookies.set(KEY_COOKIE, encryptKeys(keys), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api",
    maxAge: COOKIE_MAX_AGE,
  });
}

/** Clear the keys cookie on a response. */
export function clearKeysCookie(res: NextResponse): void {
  res.cookies.set(KEY_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api",
    maxAge: 0,
  });
}

/** Mask a key for display: keep only the last 4 chars (sk-...abcd). */
export function maskKey(key: string): string {
  return key.length > 4 ? `sk-...${key.slice(-4)}` : "sk-...";
}
