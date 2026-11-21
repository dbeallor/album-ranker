"use client";

import { useState } from "react";

const DEFAULT_SIZE = 125;

/** Album cover that falls back to a grey square when there is no image or it fails to load. */
export function Cover({ src, alt, size = DEFAULT_SIZE }: { src: string | null; alt: string; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (failed || src === null) {
    return (
      <div
        role="img"
        aria-label={`No cover for ${alt}`}
        style={{
          width: size,
          height: size,
          background: "#d4d4d4",
          color: "#737373",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(size * 0.38),
        }}
      >
        ♪
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote cover from Cover Art Archive; needs a plain img for onError
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
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
