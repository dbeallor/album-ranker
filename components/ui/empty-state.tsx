import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./empty-state.module.css";

type EmptyStateProps = ComponentPropsWithoutRef<"div"> & {
  /** Optional button or link under the message. */
  action?: ReactNode;
};

/** A muted, centered "nothing here yet" message. */
export function EmptyState({ action, className, children, ...rest }: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, className)} {...rest}>
      <p>{children}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
