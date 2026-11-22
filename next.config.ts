import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

// Links from before the library and analytics pages. Query values pass through to the destination.
// A `has` rule comes before the plain `/artists` rule so a decade picks its scope.
const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone, which `npm run build:lambda` packages for AWS Lambda.
  output: "standalone",
  poweredByHeader: false,
  // Also set by proxy.ts, which covers the responses it answers itself.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          ...securityHeaders({ development: process.env.NODE_ENV === "development" }),
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/artists",
        has: [{ type: "query", key: "decade", value: "(?<decade>\\d{4})" }],
        destination: "/analytics?view=artists&scope=decade-:decade",
        permanent: false,
      },
      { source: "/artists", destination: "/analytics?view=artists", permanent: false },
      { source: "/years", destination: "/library?sort=year", permanent: false },
      { source: "/years/:year(\\d{4})", destination: "/analytics?scope=year-:year", permanent: false },
      { source: "/decades", destination: "/analytics?view=decades", permanent: false },
      { source: "/decades/:decade(\\d{4})", destination: "/analytics?scope=decade-:decade", permanent: false },
    ];
  },
};

export default nextConfig;
