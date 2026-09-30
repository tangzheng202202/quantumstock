/** Authentication is optional only for the loopback development prototype. */
export type AuthMode = "prototype" | "clerk" | "unavailable";

function configuredKey(value: string | undefined, kind: "pk" | "sk"): boolean {
  // Clerk publishable keys may contain standard or URL-safe base64 characters.
  // This is only a shape check; Clerk validates the real key when it runs.
  return new RegExp(`^${kind}_(test|live)_[A-Za-z0-9+/_-]{16,}={0,2}$`).test(value?.trim() ?? "");
}

/** Public key is intentionally available at build time; the secret key is runtime-only. */
export function hasClerkPublishableKey(): boolean {
  return configuredKey(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, "pk");
}

export function authMode(): AuthMode {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (hasClerkPublishableKey() && configuredKey(secretKey, "sk")) return "clerk";
  if (!publishableKey && !secretKey && process.env.NODE_ENV !== "production") return "prototype";
  return "unavailable";
}

export function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
