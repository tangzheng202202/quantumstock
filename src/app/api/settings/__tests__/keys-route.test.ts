/**
 * Integration tests for /api/settings/keys — status reporting, persistence
 * via the encrypted HttpOnly cookie, validation, and deletion.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PUT } from "../keys/route";
import { KEY_COOKIE } from "@/lib/server/api-keys";

const VALID_DEEPSEEK = "sk-abcdef1234567890abcdef1234";
const VALID_CLAUDE = "sk-ant-abcdef1234567890abcd";

function reqWithCookie(cookieHeader: string | null, init?: RequestInit): NextRequest {
  const headers = new Headers(init?.headers);
  if (cookieHeader) headers.set("cookie", cookieHeader);
  return new NextRequest("http://localhost/api/settings/keys", { ...init, headers });
}

function extractSetCookie(res: Response): string {
  return res.headers.get("set-cookie") ?? "";
}

describe("GET /api/settings/keys", () => {
  it("reports all providers unconfigured without a cookie", async () => {
    const res = await GET(reqWithCookie(null));
    const j = await res.json();
    expect(j.success).toBe(true);
    expect(j.data.providers.deepseek).toEqual({ configured: false, masked: null });
    expect(j.data.providers.claude).toEqual({ configured: false, masked: null });
  });
});

describe("PUT /api/settings/keys", () => {
  it("rejects malformed keys with 400", async () => {
    const req = new NextRequest("http://localhost/api/settings/keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: { deepseek: "short" } }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.success).toBe(false);
  });

  it("rejects invalid body shape (validation error)", async () => {
    const req = new NextRequest("http://localhost/api/settings/keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wrong: true }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("persists a valid key in an HttpOnly cookie and returns masked status", async () => {
    const req = new NextRequest("http://localhost/api/settings/keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: { deepseek: VALID_DEEPSEEK } }),
    });
    const res = await PUT(req);
    const j = await res.json();

    expect(j.success).toBe(true);
    expect(j.data.providers.deepseek.configured).toBe(true);
    expect(j.data.providers.deepseek.masked).toBe(`sk-...${VALID_DEEPSEEK.slice(-4)}`);
    // Response must never echo the key itself
    expect(JSON.stringify(j)).not.toContain(VALID_DEEPSEEK);

    const setCookie = extractSetCookie(res);
    expect(setCookie).toContain(`${KEY_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    // Cookie value must be encrypted — no plaintext key material
    expect(decodeURIComponent(setCookie)).not.toContain(VALID_DEEPSEEK);
  });

  it("round-trips: GET after PUT reports the provider as configured", async () => {
    const putReq = new NextRequest("http://localhost/api/settings/keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: { deepseek: VALID_DEEPSEEK, claude: VALID_CLAUDE } }),
    });
    const putRes = await PUT(putReq);
    const cookie = extractSetCookie(putRes).split(";")[0];

    const getRes = await GET(reqWithCookie(cookie));
    const j = await getRes.json();
    expect(j.data.providers.deepseek.configured).toBe(true);
    expect(j.data.providers.claude.configured).toBe(true);
    expect(j.data.providers.openai.configured).toBe(false);
  });

  it("merges updates and removes a provider when passed an empty string", async () => {
    // Seed two providers
    const seed = new NextRequest("http://localhost/api/settings/keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: { deepseek: VALID_DEEPSEEK, claude: VALID_CLAUDE } }),
    });
    const seedRes = await PUT(seed);
    const seedCookie = extractSetCookie(seedRes).split(";")[0];

    // Remove claude, keep deepseek
    const update = reqWithCookie(seedCookie, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: { claude: "" } }),
    });
    const updateRes = await PUT(update);
    const j = await updateRes.json();
    expect(j.data.providers.claude.configured).toBe(false);
    expect(j.data.providers.deepseek.configured).toBe(true);
  });
});

describe("DELETE /api/settings/keys", () => {
  it("clears all keys and expires the cookie", async () => {
    const res = await DELETE(reqWithCookie(null));
    const j = await res.json();
    expect(j.success).toBe(true);
    expect(j.data.providers.deepseek.configured).toBe(false);
    expect(extractSetCookie(res)).toMatch(/Max-Age=0/i);
  });
});
