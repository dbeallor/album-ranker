import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageShell } from "@/components/ui/page-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Album ranker",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
