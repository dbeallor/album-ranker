import { createElement } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { cx, type Gap } from "./cx";
import styles from "./cluster.module.css";

type ClusterProps = ComponentPropsWithoutRef<"div"> & {
  as?: "div" | "section" | "ul" | "ol" | "form";
  /** Space between children, as a `--space-N` token. Defaults to 2 (8px). */
  gap?: Gap;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
};

/** Children in a horizontal row that wraps onto more rows when it runs out of room. */
export function Cluster({ as = "div", gap = 2, align = "center", justify = "start", className, ...rest }: ClusterProps) {
  return createElement(as, {
    className: cx(styles.cluster, styles[`gap${gap}`], styles[`align-${align}`], styles[`justify-${justify}`], className),
    ...rest,
  });
}
