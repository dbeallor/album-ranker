import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./page-header.module.css";
import { SectionLabel } from "./section-label";

type PageHeaderProps = Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  /** Small numbered label above the title, such as `01 / Add albums`. */
  label?: string;
  /** Rendered as the page's `h1`, in the display size. */
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or links shown beside the title (under it on phones). */
  actions?: ReactNode;
};

export function PageHeader({ label, title, description, actions, className, ...rest }: PageHeaderProps) {
  return (
    <div className={cx(styles.header, className)} {...rest}>
      <div className={styles.text}>
        {label ? <SectionLabel>{label}</SectionLabel> : null}
        <h1>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
