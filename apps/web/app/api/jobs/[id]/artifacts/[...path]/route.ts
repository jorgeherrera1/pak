import { streamBlob } from "../../../../../../lib/blob";
import { isUuid } from "../../../../../../lib/db";

const ALLOWED =
  /^(source\.pdf|analysis\.json|parsed\.json|figures\/[\w.-]+\.png)$/;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path } = await ctx.params;
  const name = path.join("/");
  if (!isUuid(id) || !ALLOWED.test(name))
    return Response.json({ error: "not found" }, { status: 404 });
  const blob = await streamBlob(`${id}/${name}`);
  if (!blob) return Response.json({ error: "not found" }, { status: 404 });
  return new Response(blob.body, {
    headers: {
      "content-type": blob.contentType,
      "x-content-type-options": "nosniff",
    },
  });
}
