/**
 * One `[gate] {json}` line per failed gate attempt, so CloudWatch Logs Insights finds them with `filter @message like "[gate]"`.
 * Callers pass only the fields the ALBUM-65 spec lists: never the password, the session cookie, the origin secret, the `next` value or a query string.
 */
export function logGate(event: Record<string, string | boolean>, level: "warn" | "error" = "warn"): void {
  console[level](`[gate] ${JSON.stringify(event)}`);
}
