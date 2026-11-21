"use client";

import { useState } from "react";

const SIZE = 125;

/** Album cover that falls back to a grey square when there is no image or it fails to load. */
export function Cover({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed || src === null) {
    return (
      <div
        role="img"
        aria-label={`No cover for ${alt}`}
        style={{
          width: SIZE,
          height: SIZE,
          background: "#d4d4d4",
          color: "#737373",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 48,
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
      width={SIZE}
      height={SIZE}
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
