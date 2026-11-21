import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import { SiteHeader } from "./site-header";
import styles from "./page-shell.module.css";

/**
 * The header, then the page's one `<main>`, a centered content area at `--content-width`. Used
 * once, in `app/layout.tsx`, so pages and `not-found` render their content without a `<main>`.
 */
export function PageShell({ className, children, ...rest }: ComponentPropsWithoutRef<"main">) {
  return (
    <>
      <SiteHeader />
      <main className={cx(styles.content, className)} {...rest}>
        {children}
      </main>
    </>
  );
}
