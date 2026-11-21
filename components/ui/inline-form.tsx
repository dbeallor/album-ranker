import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import styles from "./inline-form.module.css";

/**
 * A form with a field and its button in one row, stacked on phones. The first child grows to
 * fill the row; the rest keep their natural width.
 */
export function InlineForm({ className, ...rest }: ComponentPropsWithoutRef<"form">) {
  return <form className={cx(styles.form, className)} {...rest} />;
}
