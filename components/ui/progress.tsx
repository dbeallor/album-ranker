import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import styles from "./progress.module.css";

type ProgressProps = Omit<ComponentPropsWithoutRef<"progress">, "value" | "max" | "children"> & {
  value: number;
  /** Defaults to 100. */
  max?: number;
  /** Accessible name. Required, since a bar has no text of its own. */
  "aria-label": string;
};

/** A horizontal bar over the native `<progress>` element, so screen readers get the value and no inline style is needed. */
export function Progress({ value, max = 100, className, ...rest }: ProgressProps) {
  return <progress className={cx(styles.progress, className)} value={value} max={max} {...rest} />;
}
