/**
 * Tests for the server-side API key store (D1 security fix):
 * AES-256-GCM round-trip, tamper resistance, masking, and cookie helpers.
 */
import { createCipheriv, scryptSync } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  KEY_COOKIE,
  clearKeysCookie,
  decryptKeys,
  encryptKeys,
  maskKey,
  readKeysFromRequest,
  writeKeysCookie,
} from "../api-keys";

const OWNER_A = "clerk:user_a";
const OWNER_B = "clerk:user_b";
const PROTOTYPE_OWNER = "prototype:loopback";

beforeEach(() => vi.stubEnv("KEY_ENCRYPTION_SECRET", "test-cookie-secret"));
afterEach(() => vi.unstubAllEnvs());

describe("server/api-keys crypto", () => {
  it("encrypts and decrypts a keys record (round-trip)", () => {
    const keys = { deepseek: "sk-abcdef1234567890abcdef", claude: "sk-ant-xyz9876543210abcd" };
    const token = encryptKeys(keys, OWNER_A);
    expect(token).toMatch(/^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    // Ciphertext must not contain any plaintext key material
    expect(token).not.toContain("sk-");
    expect(decryptKeys(token, OWNER_A)).toEqual(keys);
  });

  it("produces different tokens for identical input (random IV)", () => {
    const keys = { deepseek: "sk-abcdef1234567890abcdef" };
    expect(encryptKeys(keys, OWNER_A)).not.toBe(encryptKeys(keys, OWNER_A));
  });

  it("rejects another Clerk user, the local prototype, and missing owners", () => {
    const keys = { deepseek: "sk-abcdef1234567890abcdef" };
    const token = encryptKeys(keys, OWNER_A);
    expect(decryptKeys(token, OWNER_B)).toBeNull();
    expect(decryptKeys(token, PROTOTYPE_OWNER)).toBeNull();
    expect(decryptKeys(token, "")).toBeNull();
    expect(() => encryptKeys(keys, "")).toThrow("owner is required");
  });

  it("rejects a genuine unbound v1 cookie, even if prefixed with v2", () => {
    const iv = Buffer.alloc(12, 1);
    const key = scryptSync("test-cookie-secret", "quantumstock:ai-keys:v1", 32);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ deepseek: "sk-old-key" }), "utf8"), cipher.final()]);
    const data = Buffer.concat([ciphertext, cipher.getAuthTag()]).toString("base64url");
    const legacy = `${iv.toString("base64url")}.${data}`;
    expect(decryptKeys(legacy, OWNER_A)).toBeNull();
    expect(decryptKeys(`v2.${legacy}`, OWNER_A)).toBeNull();
    const req = new NextRequest("http://localhost/api/settings/keys", {
      headers: { cookie: `${KEY_COOKIE}=${legacy}` },
    });
    expect(readKeysFromRequest(req, OWNER_A)).toEqual({});
  });

  it("returns null for tampered tokens (GCM auth tag)", () => {
    const token = encryptKeys({ deepseek: "sk-abcdef1234567890abcdef" }, OWNER_A);
    const [version, iv, data] = token.split(".");
    // Flip a character inside the ciphertext portion
    const tampered = `${version}.${iv}.${data.slice(0, -2)}${data.endsWith("A") ? "B" : "A"}`;
    expect(decryptKeys(tampered, OWNER_A)).toBeNull();
  });

  it("returns null for malformed tokens", () => {
    expect(decryptKeys("not-a-token", OWNER_A)).toBeNull();
    expect(decryptKeys("", OWNER_A)).toBeNull();
    expect(decryptKeys("a.b.c", OWNER_A)).toBeNull();
  });
});

describe("server/api-keys cookie helpers", () => {
  it("writeKeysCookie → readKeysFromRequest round-trip", () => {
    const keys = { openai: "sk-proj-abcdef1234567890ab", minimax: "mm-key-1234567890" };
    const res = NextResponse.json({ ok: true });
    writeKeysCookie(res, keys, OWNER_A);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${KEY_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie).toContain("SameSite=strict");
    expect(setCookie).toContain("Path=/api");

    // Feed the cookie back through an incoming request
    const cookieValue = setCookie.split(`${KEY_COOKIE}=`)[1].split(";")[0];
    const req = new NextRequest("http://localhost/api/ai/analyze", {
      headers: { cookie: `${KEY_COOKIE}=${cookieValue}` },
    });
    expect(readKeysFromRequest(req, OWNER_A)).toEqual(keys);
    expect(readKeysFromRequest(req, OWNER_B)).toEqual({});
  });

  it("readKeysFromRequest returns {} when no cookie is present", () => {
    const req = new NextRequest("http://localhost/api/ai/analyze");
    expect(readKeysFromRequest(req, OWNER_A)).toEqual({});
  });

  it("readKeysFromRequest returns {} for a garbage cookie value", () => {
    const req = new NextRequest("http://localhost/api/ai/analyze", {
      headers: { cookie: `${KEY_COOKIE}=garbage-value` },
    });
    expect(readKeysFromRequest(req, OWNER_A)).toEqual({});
  });

  it("clearKeysCookie expires the cookie", () => {
    const res = NextResponse.json({ ok: true });
    clearKeysCookie(res);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${KEY_COOKIE}=`);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});

describe("maskKey", () => {
  it("keeps only the last 4 characters", () => {
    expect(maskKey("sk-abcdef1234567890wxyz")).toBe("sk-...wxyz");
  });

  it("handles short keys", () => {
    expect(maskKey("abc")).toBe("sk-...");
  });
});
