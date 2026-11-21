import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import { FieldFrame, useFieldIds, type FieldProps } from "./field";
import styles from "./field.module.css";

type SelectProps = ComponentPropsWithoutRef<"select"> &
  FieldProps & {
    /** Class for the wrapper; `className` goes on the select. */
    fieldClassName?: string;
  };

/** The native `select`, styled. Pass `option`s as children. */
export function Select({ label, hint, error, id, className, fieldClassName, "aria-describedby": describedBy, ...rest }: SelectProps) {
  const ids = useFieldIds(id, describedBy, hint, error);
  return (
    <FieldFrame
      controlId={ids.controlId}
      label={label}
      hint={hint}
      hintId={ids.hintId}
      error={error}
      errorId={ids.errorId}
      className={fieldClassName}
    >
      <select
        id={ids.controlId}
        className={cx(styles.control, styles.select, className)}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldFrame>
  );
}
