import { createElement } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { cx, type Gap } from "./cx";
import styles from "./stack.module.css";

type StackProps = ComponentPropsWithoutRef<"div"> & {
  as?: "div" | "section" | "ul" | "ol" | "form";
  /** Space between children, as a `--space-N` token. Defaults to 4 (16px). */
  gap?: Gap;
};

/** Children in a vertical column with even spacing. */
export function Stack({ as = "div", gap = 4, className, ...rest }: StackProps) {
  return createElement(as, { className: cx(styles.stack, styles[`gap${gap}`], className), ...rest });
}
