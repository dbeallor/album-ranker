import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import styles from "./tabs.module.css";

type TabsProps = Omit<ComponentPropsWithoutRef<"nav">, "children"> & {
  /** Accessible name of the nav. Required, because a page can have more than one. */
  "aria-label": string;
  /** The caller decides which one is current, from the route or its search params. */
  items: ReadonlyArray<{ href: string; label: string; current?: boolean }>;
};

/** A row of pill links. The current one gets `aria-current="page"`. */
export function Tabs({ items, className, ...rest }: TabsProps) {
  return (
    <nav className={cx(styles.tabs, className)} {...rest}>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={styles.tab} aria-current={item.current ? "page" : undefined}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
