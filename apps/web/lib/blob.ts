import { Readable } from "node:stream";
import {
  BlobServiceClient,
  type ContainerClient,
  RestError,
} from "@azure/storage-blob";

let jobs: ContainerClient | undefined;

// Opened on first use, not at import: `next build` loads route modules while collecting page data.
function container(): ContainerClient {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  }
  if (!jobs) {
    jobs =
      BlobServiceClient.fromConnectionString(
        connectionString,
      ).getContainerClient("jobs");
  }
  return jobs;
}

export async function putBlob(
  path: string,
  data: Uint8Array,
  contentType: string,
) {
  await container()
    .getBlockBlobClient(path)
    .uploadData(data, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
}

// One GET per read: a missing blob is the 404 the SDK throws, not a separate HEAD first.
export async function streamBlob(path: string) {
  try {
    const res = await container().getBlockBlobClient(path).download();
    return {
      body: Readable.toWeb(
        res.readableStreamBody as Readable,
      ) as ReadableStream,
      contentType: res.contentType ?? "application/octet-stream",
    };
  } catch (err) {
    if (err instanceof RestError && err.statusCode === 404) return null;
    throw err;
  }
}

export async function getBlob(path: string): Promise<Buffer | null> {
  const blob = await streamBlob(path);
  return blob && Buffer.from(await new Response(blob.body).bytes());
}
