// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isResponseTooLarge, readJsonCapped } from "./read-json";

const CAP = 100;

/** A response whose body streams in pieces, with no Content-Length unless given one. */
function streamed(pieces: string[], headers: Record<string, string> = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  return new Response(body, { headers });
}

describe("readJsonCapped", () => {
  it.each([
    { name: "a body under the cap", response: () => streamed(['{"a":', "1}"]), parsed: { a: 1 } },
    { name: "a body with multi-byte characters", response: () => new Response('{"a":"é"}'), parsed: { a: "é" } },
  ])("parses $name", async ({ response, parsed }) => {
    expect(await readJsonCapped(response(), CAP)).toEqual(parsed);
  });

  it.each([
    { name: "a Content-Length over the cap", response: () => streamed(["{}"], { "Content-Length": String(CAP + 1) }) },
    { name: "a streamed body over the cap with no Content-Length", response: () => streamed(["[", "1,".repeat(60), "1]"]) },
    { name: "a streamed body over the cap that claims to be small", response: () => streamed(["x".repeat(CAP + 1)], { "Content-Length": "2" }) },
  ])("refuses $name", async ({ response }) => {
    const error = await readJsonCapped(response(), CAP).catch((e: unknown) => e);

    expect(isResponseTooLarge(error)).toBe(true);
  });

  it("throws a plain parse error for bad JSON, not ResponseTooLarge", async () => {
    const error = await readJsonCapped(new Response("<html>"), CAP).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SyntaxError);
    expect(isResponseTooLarge(error)).toBe(false);
  });
});
