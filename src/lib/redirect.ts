/**
 * Post-login/signup redirect targets come from a query string, so they are attacker-controlled.
 * Only same-site, path-absolute URLs are allowed. Browsers treat "/\" like "//" (protocol-relative),
 * so a second slash or a backslash right after the leading slash is rejected too.
 */
export function safeRedirect(next: unknown, fallback: string): string {
  if (typeof next !== "string") return fallback;
  if (!/^\/(?![/\\])/.test(next)) return fallback;
  // No control characters (header/URL smuggling).
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
