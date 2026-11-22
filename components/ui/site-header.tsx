"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
 * A slim bar with the app name and a link to each page. The link for the section you are in
 * gets `aria-current="page"`.
 */
export function SiteHeader({ className, ...rest }: React.ComponentPropsWithoutRef<"header">) {
  const pathname = usePathname();

  return (
    <header className={cx(styles.header, className)} {...rest}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          Album ranker
        </Link>
        <nav aria-label="Main" className={styles.nav}>
          <ul className={styles.list}>
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={styles.link}
                  aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
