// @vitest-environment node
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { createAwsObjectStore } from "./s3-store.ts";
import { ConditionFailedError } from "./s3-sync.ts";

class AwsFailure extends Error {
  $metadata: { httpStatusCode: number };
  constructor(name: string, httpStatusCode: number) {
    super(name);
    this.name = name;
    this.$metadata = { httpStatusCode };
  }
}

/** A stub client that answers every command with `reply` and records what it was sent. */
function stubClient(reply: (command: unknown) => unknown) {
  const sent: unknown[] = [];
  return {
    sent,
    client: {
      async send(command: unknown) {
        sent.push(command);
        const result = reply(command);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

const target = { bucket: "data", key: "album-ranker.db" };

describe("createAwsObjectStore", () => {
  it("heads the object and returns its ETag", async () => {
    const { client, sent } = stubClient(() => ({ ETag: '"abc"' }));
    expect(await createAwsObjectStore(target, client).head()).toEqual({ etag: '"abc"' });
    expect(sent[0]).toBeInstanceOf(HeadObjectCommand);
    expect((sent[0] as HeadObjectCommand).input).toEqual({ Bucket: "data", Key: "album-ranker.db" });
  });

  it("gets the object's bytes and ETag", async () => {
    const { client, sent } = stubClient(() => ({ ETag: '"abc"', Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } }));
    expect(await createAwsObjectStore(target, client).get()).toEqual({ body: new Uint8Array([1, 2, 3]), etag: '"abc"' });
    expect(sent[0]).toBeInstanceOf(GetObjectCommand);
  });

  const missing: { name: string; call: "head" | "get"; error: Error }[] = [
    { name: "head of a missing object", call: "head", error: new AwsFailure("NotFound", 404) },
    { name: "get of a missing object", call: "get", error: new AwsFailure("NoSuchKey", 404) },
  ];
  for (const { name, call, error } of missing) {
    it(`${name} gives null`, async () => {
      const { client } = stubClient(() => error);
      expect(await createAwsObjectStore(target, client)[call]()).toBeNull();
    });
  }

  it("passes other failures on", async () => {
    const { client } = stubClient(() => new AwsFailure("AccessDenied", 403));
    await expect(createAwsObjectStore(target, client).head()).rejects.toThrow("AccessDenied");
  });

  const puts: { name: string; condition: Parameters<ReturnType<typeof createAwsObjectStore>["put"]>[1]; expected: Record<string, string> }[] = [
    { name: "an update sends If-Match", condition: { ifMatch: '"abc"' }, expected: { IfMatch: '"abc"' } },
    { name: "a first upload sends If-None-Match: *", condition: { ifNoneMatch: "*" }, expected: { IfNoneMatch: "*" } },
  ];
  for (const { name, condition, expected } of puts) {
    it(name, async () => {
      const { client, sent } = stubClient(() => ({ ETag: '"new"' }));
      const body = new Uint8Array([9]);
      expect(await createAwsObjectStore(target, client).put(body, condition)).toEqual({ etag: '"new"' });
      expect(sent[0]).toBeInstanceOf(PutObjectCommand);
      expect((sent[0] as PutObjectCommand).input).toMatchObject({ Bucket: "data", Key: "album-ranker.db", Body: body, ...expected });
    });
  }

  const failures: { name: string; error: Error; expected: "condition" | "other" }[] = [
    { name: "412 PreconditionFailed", error: new AwsFailure("PreconditionFailed", 412), expected: "condition" },
    { name: "409 ConditionalRequestConflict", error: new AwsFailure("ConditionalRequestConflict", 409), expected: "condition" },
    { name: "500 InternalError", error: new AwsFailure("InternalError", 500), expected: "other" },
  ];
  for (const { name, error, expected } of failures) {
    it(`a put that fails with ${name} is ${expected === "condition" ? "a ConditionFailedError" : "passed on as is"}`, async () => {
      const { client } = stubClient(() => error);
      const result = createAwsObjectStore(target, client).put(new Uint8Array(), { ifMatch: '"abc"' });
      if (expected === "condition") await expect(result).rejects.toBeInstanceOf(ConditionFailedError);
      else await expect(result).rejects.toBe(error);
    });
  }
});
