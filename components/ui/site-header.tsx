"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { cx } from "./cx";
import styles from "./site-header.module.css";

/** The main nav in flow order, exported so a test can check every link has a route. */
export const NAV_ITEMS = [
  { href: "/search", label: "Add albums" },
  { href: "/library", label: "Library" },
  { href: "/matchups", label: "Play" },
  { href: "/analytics", label: "Rankings" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A slim bar with the app name and a Menu button. The button opens a full-screen native
 * `<dialog>` that lists the nav as large numbered links; the dialog traps focus, closes on
 * Escape and gives focus back to the Menu button. The link for the section you are in gets
 * `aria-current="page"`.
 */
export function SiteHeader({ className, ...rest }: React.ComponentPropsWithoutRef<"header">) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <header className={cx(styles.header, className)} {...rest}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          Album ranker
        </Link>
        <button type="button" className={styles.toggle} onClick={() => dialog.current?.showModal()}>
          Menu
        </button>
      </div>
      <dialog ref={dialog} className={styles.dialog} aria-label="Menu">
        <div className={cx(styles.inner, styles.dialogBar)}>
          <span className={styles.brand}>Album ranker</span>
          <button type="button" className={styles.toggle} onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
        <nav aria-label="Main" className={styles.nav}>
          <ol className={styles.list}>
            {NAV_ITEMS.map((item, index) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={styles.link}
                  aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                  onClick={() => dialog.current?.close()}
                >
                  <span className={styles.number} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      </dialog>
    </header>
  );
}
