import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "./card";
import { cx } from "./cx";
import styles from "./link-card.module.css";

type LinkCardProps = {
  href: string;
  /** The link text, and the link's accessible name. */
  title: ReactNode;
  /** One line under the title. It is not part of the link's name. */
  description?: ReactNode;
  className?: string;
};

/** A list item card whose whole area is one link, for the home page grid. Use inside a `CardGrid`. */
export function LinkCard({ href, title, description, className }: LinkCardProps) {
  return (
    <Card as="li" className={cx(styles.card, className)}>
      <Link href={href} className={styles.link}>
        {title}
      </Link>
      {description ? <p className={styles.description}>{description}</p> : null}
    </Card>
  );
}
