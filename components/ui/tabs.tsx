import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import styles from "./tabs.module.css";

type TabsProps = Omit<ComponentPropsWithoutRef<"nav">, "children"> & {
  /** Accessible name of the nav. Required, because a page can have more than one. */
  "aria-label": string;
  /** The caller decides which one is current, from the route or its search params. */
  items: ReadonlyArray<{ href: string; label: string; current?: boolean }>;
};

/** A row of pill links. The current one is a plain pill with `aria-current="page"`, not a link. */
export function Tabs({ items, className, ...rest }: TabsProps) {
  return (
    <nav className={className} {...rest}>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.href}>
            {item.current ? (
              // The current tab is not a link, so it is not offered as a destination.
              <span className={styles.tab} aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link prefetch={false} href={item.href} className={styles.tab}>
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
