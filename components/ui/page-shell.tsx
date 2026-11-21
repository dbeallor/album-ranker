import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import { SiteHeader } from "./site-header";
import styles from "./page-shell.module.css";

/**
 * The header, then a centered content area at `--content-width`. Used once, in `app/layout.tsx`.
 * The content wrapper is a div for now because each page still renders its own `<main>`;
 * once pages stop doing that, this becomes the one `<main>`.
 */
export function PageShell({ className, children, ...rest }: ComponentPropsWithoutRef<"div">) {
  return (
    <>
      <SiteHeader />
      <div className={cx(styles.content, className)} {...rest}>
        {children}
      </div>
    </>
  );
}
