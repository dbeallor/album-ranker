import { useId } from "react";
import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./field.module.css";

export type FieldProps = {
  /** Visible label. Leave out only when the design has no room, and pass `aria-label` instead. */
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

/** Wires the label, hint and error to a control. Shared by `TextField` and `Select`. */
export function useFieldIds(id: string | undefined, describedBy: string | undefined, hint: ReactNode, error: ReactNode) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const ids = [describedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;
  return { controlId, hintId, errorId, describedBy: ids };
}

export function FieldFrame({
  controlId,
  label,
  hint,
  hintId,
  error,
  errorId,
  className,
  children,
}: FieldProps & { controlId: string; hintId?: string; errorId?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cx(styles.field, className)}>
      {label ? (
        <label htmlFor={controlId} className={styles.label}>
          {label}
        </label>
      ) : null}
      {children}
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

