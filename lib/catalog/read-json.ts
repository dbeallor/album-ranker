// No `server-only` and no non-relative imports, so the import script can load this under Node's type stripping.

export const MAX_BODY_BYTES = 1_048_576;

function tooLarge(maxBytes: number): Error {
  const error = new Error(`response is over ${maxBytes} bytes`);
  error.name = "ResponseTooLarge";
  return error;
}

/** True for the error `readJsonCapped` throws when a body is over the cap, so a caller can tell it from a timeout. */
export function isResponseTooLarge(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "ResponseTooLarge";
}

/**
 * Reads a response body as JSON, refusing one over `maxBytes`. `Content-Length` is checked first, but the streamed
 * bytes are counted too, since a missing or wrong header proves nothing. Bad JSON throws as `response.json()` does.
 */
export async function readJsonCapped(response: Response, maxBytes: number): Promise<unknown> {
  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw tooLarge(maxBytes);
  }
  if (!response.body) {
    return JSON.parse("");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw tooLarge(maxBytes);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
