// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next.config", () => {
  it.each([
    {
      name: "output stays standalone",
      actual: nextConfig.output,
      expected: "standalone",
      message: "Sweep S1 item 5: the deployed command is the production standalone build, never `next dev`.",
    },
    {
      name: "serverActions.allowedOrigins stays unset",
      actual: nextConfig.experimental?.serverActions?.allowedOrigins,
      expected: undefined,
      message: "Sweep S1 item 3: Next.js checks Origin against the host headers; an allowedOrigins list would widen that check.",
    },
  ])("$name", ({ actual, expected, message }) => {
    expect(actual, message).toBe(expected);
  });
});
