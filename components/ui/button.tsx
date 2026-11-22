import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import styles from "./button.module.css";

type Look = {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  /** `icon` is a square 44px button, for a lone glyph such as the drag handle. */
  size?: "md" | "icon";
};

function lookClass({ variant = "secondary", size = "md" }: Look, className: string | undefined) {
  return cx(styles.button, styles[variant], size === "icon" && styles.icon, className);
}

/** No default `type`: inside a form it submits unless the caller passes `type="button"`, as a plain button does. */
export function Button({
  variant,
  size,
  className,
  ...rest
}: ComponentPropsWithoutRef<"button"> & Look) {
  return <button className={lookClass({ variant, size }, className)} {...rest} />;
}

/** A `next/link` that looks like a `Button`. Never prefetches, so a page load sends one request to the single server copy. */
export function ButtonLink({
  variant,
  size,
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof Link> & Look) {
  return <Link className={lookClass({ variant, size }, className)} {...rest} prefetch={false} />;
}
