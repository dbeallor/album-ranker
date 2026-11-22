import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { PageShell } from "@/components/ui/page-shell";
import "./globals.css";

// Self-hosted at build time by next/font; the browser never calls Google. The CSS variables are
// read by --font-sans and --font-display in globals.css.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const archivo = Archivo({ subsets: ["latin"], display: "swap", axes: ["wdth"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "Album ranker",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${archivo.variable}`}>
      <body>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
