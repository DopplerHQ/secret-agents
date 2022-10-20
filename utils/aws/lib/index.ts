import type { Readable } from "stream";
import { S3 } from "@aws-sdk/client-s3";

async function streamToBuffer(stream: Readable) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.once("end", () => resolve(Buffer.concat(chunks)));
    stream.once("error", reject);
  });
}

export async function fetchS3KeySet(bucket?: string) {
  if (!bucket) {
    const region = process.env.AWS_REGION;
    if (!region) {
      throw new Error("AWS_REGION is required to build bucket name");
    }
    bucket = `doppler-keys-${region}`;
  }
  const s3Client = new S3({ forcePathStyle: true });
  const keyFile = await s3Client.getObject({ Bucket: bucket, Key: "secret-agents/jwks.json" });
  const bodyBuffer = await streamToBuffer(keyFile.Body as Readable);
  return JSON.parse(new TextDecoder().decode(bodyBuffer)) as Record<string, unknown>;
}
