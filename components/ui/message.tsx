import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import styles from "./message.module.css";

type MessageProps = ComponentPropsWithoutRef<"div"> & {
  tone?: "error" | "success" | "info";
};

/**
 * A tinted, bordered block. The caller passes `role` and `aria-live` (`alert`, `status`,
 * `alertdialog`), so how screen readers announce it stays the caller's choice.
 */
export function Message({ tone = "info", className, ...rest }: MessageProps) {
  return <div className={cx(styles.message, styles[tone], className)} {...rest} />;
}
