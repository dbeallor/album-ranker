import { createElement } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./list-row.module.css";

type ListRowProps = Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  /** The element to render. Use `li` inside a list. */
  as?: "div" | "li";
  /** Usually a `Cover`. */
  cover?: ReactNode;
  /** Rendered in a `strong`. */
  title: ReactNode;
  /** The artist, under the title. */
  subtitle?: ReactNode;
  /** Muted line under the subtitle: year, rating, rank. */
  meta?: ReactNode;
  /** Extra content under the text, inside the same column. */
  children?: ReactNode;
  /** Buttons or links. They sit beside the text, or under it on narrow screens. */
  actions?: ReactNode;
  /** Extra class for the cover's wrapper, for example to set its width. */
  coverClassName?: string;
};

/** The album row: cover, then title, artist and meta, then an actions area. */
export function ListRow({ as = "div", cover, title, subtitle, meta, children, actions, coverClassName, className, ...rest }: ListRowProps) {
  return createElement(
    as,
    { className: cx(styles.row, className), ...rest },
    cover ? <div className={cx(styles.cover, coverClassName)}>{cover}</div> : null,
    <div className={styles.body}>
      <strong className={styles.title}>{title}</strong>
      {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
      {meta ? <span className={styles.meta}>{meta}</span> : null}
      {children}
    </div>,
    actions ? <div className={styles.actions}>{actions}</div> : null,
  );
}
