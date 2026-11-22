import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./section-label.module.css";

type SectionLabelProps = Omit<ComponentPropsWithoutRef<"p">, "children"> & {
  /** Text such as `01 / Add albums`. A leading number and slash get the accent color. */
  children: ReactNode;
  /** The element to render; use a heading when the label names a section of the page. */
  as?: "p" | "h2" | "h3";
};

const NUMBERED = /^(\d+)\s*\/\s*(.+)$/;

/** Small uppercase, letter-spaced label for a section: `01 / Add albums`. */
export function SectionLabel({ as: Tag = "p", children, className, ...rest }: SectionLabelProps) {
  const match = typeof children === "string" ? NUMBERED.exec(children) : null;
  return (
    <Tag className={cx(styles.label, className)} {...rest}>
      {match ? (
        <>
          <span className={styles.number}>{match[1]}</span> / {match[2]}
        </>
      ) : (
        children
      )}
    </Tag>
  );
}
