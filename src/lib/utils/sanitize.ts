/**
 * Shared sanitization utilities for error messages and user-facing strings.
 * Used by AI client and API routes to prevent API key leaks in logs/errors.
 */

/** Strip API key fragments and bearer tokens from error messages. */
export function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/\b(sk-[a-zA-Z0-9_-]{20,})\b/g, "sk-***")
    .replace(/\b(api[_-]?key[=:]\s*)[^\s,;)]+/gi, "$1***")
    .replace(/\bBearer\s+\S+/gi, "Bearer ***");
}

/** Sanitize HTML content by stripping script tags and event handlers. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\bon\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
}
