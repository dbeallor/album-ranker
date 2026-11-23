"use client";

import { usePathname } from "next/navigation";
import { Capturing } from "./client-events-capture";

// Front-end event capture (ALBUM-85). Does nothing unless the build set NEXT_PUBLIC_CLIENT_EVENTS=1 (build:lambda
// does), and nothing on /login. The flag is read here, apart from the capture code, so a build without it drops
// that code (next.config.ts inlines the flag as "0" then).
export function ClientEvents() {
  const pathname = usePathname();
  if (process.env.NEXT_PUBLIC_CLIENT_EVENTS !== "1" || pathname === "/login") return null;
  return <Capturing pathname={pathname} />;
}
