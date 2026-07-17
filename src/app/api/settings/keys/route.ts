/**
 * /api/settings/keys — user AI key management (D1 security fix).
 *
 * Keys are stored encrypted in an HttpOnly cookie (see lib/server/api-keys).
 * The client can only ever see configuration status + masked tails, never
 * the key material itself.
 *
 *   GET     → { providers: { deepseek: { configured: true, masked: "sk-...ab12" }, ... } }
 *   PUT     → body { keys: { deepseek: "sk-..." | "", ... } }  ("" removes one)
 *   DELETE  → clears all stored keys
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { validate } from "@/lib/api/validation";
import {
  clearKeysCookie,
  maskKey,
  readKeysFromRequest,
  writeKeysCookie,
  type StoredKeys,
} from "@/lib/server/api-keys";
import { validateKeyFormat } from "@/lib/storage/api-keys";

export const dynamic = "force-dynamic";

const PROVIDERS = ["claude", "openai", "deepseek", "minimax"] as const;

const putBodySchema = z.object({
  keys: z.record(z.enum(PROVIDERS), z.string().max(200)),
});

interface ProviderStatus {
  configured: boolean;
  masked: string | null;
}

function buildStatus(keys: StoredKeys): Record<string, ProviderStatus> {
  const status: Record<string, ProviderStatus> = {};
  for (const p of PROVIDERS) {
    const key = keys[p as keyof StoredKeys];
    status[p] = key
      ? { configured: true, masked: maskKey(key) }
      : { configured: false, masked: null };
  }
  return status;
}

export const GET = withApiHandler("settings.keys", async (req: NextRequest) => {
  return apiSuccess({ providers: buildStatus(readKeysFromRequest(req)) });
});

export const PUT = withApiHandler("settings.keys", async (req: NextRequest) => {
  const body = validate(putBodySchema, await req.json());

  // Validate format of every provided key before persisting anything.
  for (const [provider, key] of Object.entries(body.keys)) {
    if (key !== "" && !validateKeyFormat(provider, key)) {
      return NextResponse.json(
        { success: false, error: `API Key 格式不正确: ${provider}` },
        { status: 400 }
      );
    }
  }

  const current = readKeysFromRequest(req);
  for (const [provider, key] of Object.entries(body.keys)) {
    const p = provider as keyof StoredKeys;
    if (key === "") delete current[p];
    else current[p] = key;
  }

  const res = apiSuccess({ providers: buildStatus(current) });
  if (Object.keys(current).length === 0) clearKeysCookie(res);
  else writeKeysCookie(res, current);
  return res;
});

export const DELETE = withApiHandler("settings.keys", async () => {
  const res = apiSuccess({ providers: buildStatus({}) });
  clearKeysCookie(res);
  return res;
});
