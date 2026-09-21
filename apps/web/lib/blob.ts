import { Readable } from "node:stream";
import { BlobServiceClient, RestError } from "@azure/storage-blob";

const container = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING!,
).getContainerClient("jobs");

export async function putBlob(
  path: string,
  data: Uint8Array,
  contentType: string,
) {
  await container.getBlockBlobClient(path).uploadData(data, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

// One GET per read: a missing blob is the 404 the SDK throws, not a separate HEAD first.
export async function streamBlob(path: string) {
  let res;
  try {
    res = await container.getBlockBlobClient(path).download();
  } catch (err) {
    if (err instanceof RestError && err.statusCode === 404) return null;
    throw err;
  }
  return {
    body: Readable.toWeb(res.readableStreamBody as Readable) as ReadableStream,
    contentType: res.contentType ?? "application/octet-stream",
  };
}

export async function getBlob(path: string): Promise<Buffer | null> {
  const blob = await streamBlob(path);
  return blob && Buffer.from(await new Response(blob.body).bytes());
}
