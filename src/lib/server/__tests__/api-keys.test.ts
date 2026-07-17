/**
 * Tests for the server-side API key store (D1 security fix):
 * AES-256-GCM round-trip, tamper resistance, masking, and cookie helpers.
 */
import { describe, expect, it } from "vitest";
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

describe("server/api-keys crypto", () => {
  it("encrypts and decrypts a keys record (round-trip)", () => {
    const keys = { deepseek: "sk-abcdef1234567890abcdef", claude: "sk-ant-xyz9876543210abcd" };
    const token = encryptKeys(keys);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    // Ciphertext must not contain any plaintext key material
    expect(token).not.toContain("sk-");
    expect(decryptKeys(token)).toEqual(keys);
  });

  it("produces different tokens for identical input (random IV)", () => {
    const keys = { deepseek: "sk-abcdef1234567890abcdef" };
    expect(encryptKeys(keys)).not.toBe(encryptKeys(keys));
  });

  it("returns null for tampered tokens (GCM auth tag)", () => {
    const token = encryptKeys({ deepseek: "sk-abcdef1234567890abcdef" });
    const [iv, data] = token.split(".");
    // Flip a character inside the ciphertext portion
    const tampered = `${iv}.${data.slice(0, -2)}${data.endsWith("A") ? "B" : "A"}`;
    expect(decryptKeys(tampered)).toBeNull();
  });

  it("returns null for malformed tokens", () => {
    expect(decryptKeys("not-a-token")).toBeNull();
    expect(decryptKeys("")).toBeNull();
    expect(decryptKeys("a.b.c")).toBeNull();
  });
});

describe("server/api-keys cookie helpers", () => {
  it("writeKeysCookie → readKeysFromRequest round-trip", () => {
    const keys = { openai: "sk-proj-abcdef1234567890ab", minimax: "mm-key-1234567890" };
    const res = NextResponse.json({ ok: true });
    writeKeysCookie(res, keys);

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
    expect(readKeysFromRequest(req)).toEqual(keys);
  });

  it("readKeysFromRequest returns {} when no cookie is present", () => {
    const req = new NextRequest("http://localhost/api/ai/analyze");
    expect(readKeysFromRequest(req)).toEqual({});
  });

  it("readKeysFromRequest returns {} for a garbage cookie value", () => {
    const req = new NextRequest("http://localhost/api/ai/analyze", {
      headers: { cookie: `${KEY_COOKIE}=garbage-value` },
    });
    expect(readKeysFromRequest(req)).toEqual({});
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
