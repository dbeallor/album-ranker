import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ConditionFailedError, type ObjectStore } from "./s3-sync.ts";

/** Just the part of `S3Client` used here, so tests can pass a stub. */
export type S3Sender = { send(command: unknown): Promise<unknown> };

type AwsError = { name?: string; $metadata?: { httpStatusCode?: number } };

function status(error: unknown): number | undefined {
  return (error as AwsError | null)?.$metadata?.httpStatusCode;
}

function isMissing(error: unknown): boolean {
  const name = (error as AwsError | null)?.name;
  return status(error) === 404 || name === "NotFound" || name === "NoSuchKey";
}

/** 412 is a failed `If-Match` or `If-None-Match`; 409 is a concurrent write to the same key. Either way the stored object is not what this copy read. */
function isConditionFailure(error: unknown): boolean {
  return status(error) === 412 || status(error) === 409;
}

/** The `ObjectStore` for one object in S3, using the Lambda's own credentials. */
export function createAwsObjectStore(target: { bucket: string; key: string }, client: S3Sender = new S3Client({})): ObjectStore {
  const { bucket, key } = target;
  const send = (command: unknown) => client.send(command);
  return {
    async head() {
      try {
        const result = (await send(new HeadObjectCommand({ Bucket: bucket, Key: key }))) as { ETag?: string };
        if (!result.ETag) throw new Error(`S3 returned no ETag for s3://${bucket}/${key}.`);
        return { etag: result.ETag };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async get() {
      try {
        const result = (await send(new GetObjectCommand({ Bucket: bucket, Key: key }))) as {
          ETag?: string;
          Body?: { transformToByteArray(): Promise<Uint8Array> };
        };
        if (!result.ETag || !result.Body) throw new Error(`S3 returned no body or ETag for s3://${bucket}/${key}.`);
        return { body: await result.Body.transformToByteArray(), etag: result.ETag };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async put(body, condition) {
      try {
        const result = (await send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: "application/vnd.sqlite3",
            ...("ifMatch" in condition ? { IfMatch: condition.ifMatch } : { IfNoneMatch: condition.ifNoneMatch }),
          }),
        )) as { ETag?: string };
        if (!result.ETag) throw new Error(`S3 returned no ETag after writing s3://${bucket}/${key}.`);
        return { etag: result.ETag };
      } catch (error) {
        if (isConditionFailure(error)) throw new ConditionFailedError();
        throw error;
      }
    },
  };
}
