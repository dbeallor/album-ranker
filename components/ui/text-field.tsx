import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import { FieldFrame, useFieldIds, type FieldProps } from "./field";
import styles from "./field.module.css";

type TextFieldProps = ComponentPropsWithoutRef<"input"> &
  FieldProps & {
    /** Class for the wrapper (sizing in a row, for example); `className` goes on the input. */
    fieldClassName?: string;
  };

export function TextField({ label, hint, error, id, className, fieldClassName, "aria-describedby": describedBy, ...rest }: TextFieldProps) {
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
      <input
        id={ids.controlId}
        className={cx(styles.control, className)}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldFrame>
  );
}
