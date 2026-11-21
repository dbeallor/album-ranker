import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import styles from "./table.module.css";

type TableProps = ComponentPropsWithoutRef<"table"> & {
  /** Names the scrollable region around the table, for keyboard and screen reader users. */
  label: string;
};

/**
 * A full-width table inside a container that scrolls on its own when a narrow screen can't fit
 * it, so the page never scrolls sideways. Put `data-numeric` on a `th` or `td` to right-align
 * a number column. `className` goes on the table.
 */
export function Table({ label, className, ...rest }: TableProps) {
  return (
    // The wrapper is focusable so a keyboard user can scroll it.
    <div className={styles.scroll} role="region" aria-label={label} tabIndex={0}>
      <table className={cx(styles.table, className)} {...rest} />
    </div>
  );
}
