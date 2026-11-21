import { createElement } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import styles from "./card.module.css";

type CardProps = ComponentPropsWithoutRef<"div"> & {
  /** The element to render. Use `li` inside a list. */
  as?: "div" | "section" | "article" | "li";
  /** `dashed` is for empty slots. A `data-over="true"` attribute styles a drop target. */
  variant?: "solid" | "dashed";
};

export function Card({ as = "div", variant = "solid", className, ...rest }: CardProps) {
  return createElement(as, { className: cx(styles.card, variant === "dashed" && styles.dashed, className), ...rest });
}
