/** Where to go after logging in: a path on this site, else the home page. */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  // `//host` and `/\host` are read by browsers as another site; control characters can split a header.
  if (next.startsWith("//") || next.startsWith("/\\") || /[\u0000-\u001f\u007f]/.test(next)) return "/";
  // Back to the login page would loop.
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/login/")) return "/";
  return next;
}
