"use client";

import { useState, type CSSProperties } from "react";
import { cx } from "@/components/ui/cx";
import styles from "./cover.module.css";

const DEFAULT_SIZE = 125;

/**
 * Album cover that falls back to a grey square when there is no image or it fails to load.
 * `fill` stretches it to the width of its container; `size` is then only the image's intrinsic size.
 */
export function Cover({ src, alt, size = DEFAULT_SIZE, fill = false }: { src: string | null; alt: string; size?: number; fill?: boolean }) {
  const [failed, setFailed] = useState(false);

  if (failed || src === null) {
    return (
      <div role="img" aria-label={`No cover for ${alt.replace(/^Cover of /, "")}`} className={cx(styles.cover, styles.placeholder, fill && styles.fill)} style={{ "--cover-size": `${size}px` } as CSSProperties}>
        ♪
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote cover (Cover Art Archive or Deezer); needs a plain img for onError
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cx(styles.cover, fill && styles.fill)}
      style={{ "--cover-size": `${size}px` } as CSSProperties}
      loading="lazy"
      onError={() => setFailed(true)}
      ref={(img) => {
        // The error can fire before hydration attaches onError; catch that case here.
        if (img && img.complete && img.naturalWidth === 0) {
          setFailed(true);
        }
      }}
    />
  );
}
