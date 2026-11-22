export type SecurityHeader = { key: string; value: string };

const COVER_HOSTS = [
  "https://coverartarchive.org",
  "https://archive.org",
  "https://*.archive.org",
  "https://cdn-images.dzcdn.net",
  "https://e-cdns-images.dzcdn.net",
];

/**
 * The hardening headers every response carries. Plain data, so next.config.ts can import it; proxy.ts sets the same list
 * on every response it handles, including the ones it answers itself (next.config.ts headers() does not reach those). HSTS is left to CloudFront, and a local run is plain HTTP.
 */
export function securityHeaders({ development }: { development: boolean }): SecurityHeader[] {
  const csp = [
    "default-src 'self'",
    // React needs eval in development for its error stacks.
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' ${COVER_HOSTS.join(" ")}`,
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "same-origin" },
  ];
}
