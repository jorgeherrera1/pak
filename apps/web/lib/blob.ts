import { BlobServiceClient } from "@azure/storage-blob";

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

export async function getBlob(path: string): Promise<Buffer | null> {
  const blob = container.getBlockBlobClient(path);
  if (!(await blob.exists())) return null;
  return blob.downloadToBuffer();
}

export async function streamBlob(path: string) {
  const blob = container.getBlockBlobClient(path);
  if (!(await blob.exists())) return null;
  const res = await blob.download();
  const { Readable } = await import("node:stream");
  return {
    body: Readable.toWeb(
      res.readableStreamBody as import("node:stream").Readable,
    ) as ReadableStream,
    contentType: res.contentType ?? "application/octet-stream",
  };
}
