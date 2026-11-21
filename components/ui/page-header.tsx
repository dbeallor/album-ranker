import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./page-header.module.css";

type PageHeaderProps = Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  /** Rendered as the page's `h1`. */
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or links shown beside the title (under it on phones). */
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions, className, ...rest }: PageHeaderProps) {
  return (
    <div className={cx(styles.header, className)} {...rest}>
      <div className={styles.text}>
        <h1>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
