/**
 * ApiKey Repository — server-side encrypted storage.
 * Uses AES-256-GCM for at-rest encryption.
 *
 * SECURITY:
 * - Keys are encrypted with a server-side master key (ENCRYPTION_KEY env var).
 * - Keys are never returned in plaintext — only masked (sk-...xxxx) for display.
 * - Decryption only happens server-side, just-in-time for API calls.
 */

let _crypto: typeof import("crypto") | null = null;
async function getCrypto() {
  if (!_crypto && typeof window === "undefined") {
    _crypto = await import("crypto");
  }
  return _crypto;
}

function getEncryptionKey(): Buffer | null {
  if (typeof window !== "undefined") return null;
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) return null;
  return Buffer.from(key.slice(0, 32), "utf-8");
}

/** Encrypt plaintext key (server-side only). Returns <iv>:<authTag>:<ciphertext> hex. */
export async function encryptApiKey(plaintext: string): Promise<string | null> {
  const crypto = await getCrypto();
  const encKey = getEncryptionKey();
  if (!crypto || !encKey) return null;

  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
  } catch {
    return null;
  }
}

/** Decrypt encrypted key (server-side only). Returns plaintext or null. */
export async function decryptApiKey(encrypted: string): Promise<string | null> {
  const crypto = await getCrypto();
  const encKey = getEncryptionKey();
  if (!crypto || !encKey) return null;

  try {
    const parts = encrypted.split(":");
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const ciphertext = Buffer.from(parts[2], "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", encKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf-8");
  } catch {
    return null;
  }
}

/** Mask a key for display: sk-ant-...xxxx (last 4 chars visible). */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return "***";
  const prefix = key.slice(0, 3);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}
