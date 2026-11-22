import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import styles from "./card-grid.module.css";

/** A responsive grid of equal-width columns, one column on phones. Children are usually `Card`s. */
export function CardGrid({ className, ...rest }: ComponentPropsWithoutRef<"ul">) {
  return <ul className={cx(styles.grid, className)} {...rest} />;
}
