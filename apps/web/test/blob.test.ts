import { Readable } from "node:stream";
import { RestError } from "@azure/storage-blob";
import { expect, test, vi } from "vitest";

const { download } = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@azure/storage-blob", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@azure/storage-blob")>()),
  BlobServiceClient: {
    fromConnectionString: () => ({
      getContainerClient: () => ({ getBlockBlobClient: () => ({ download }) }),
    }),
  },
}));
process.env.AZURE_STORAGE_CONNECTION_STRING = "test";
const { getBlob, streamBlob } = await import("@/lib/blob");

test("missing blob is null after a single request", async () => {
  download.mockRejectedValueOnce(new RestError("nope", { statusCode: 404 }));
  expect(await getBlob("a")).toBeNull();
  expect(download).toHaveBeenCalledTimes(1);
});
test("other errors propagate", async () => {
  download.mockRejectedValueOnce(new RestError("denied", { statusCode: 403 }));
  await expect(streamBlob("a")).rejects.toThrow("denied");
});
test("present blob is buffered", async () => {
  download.mockResolvedValueOnce({
    readableStreamBody: Readable.from([Buffer.from("hi")]),
    contentType: "text/plain",
  });
  expect((await getBlob("a"))?.toString()).toBe("hi");
});
