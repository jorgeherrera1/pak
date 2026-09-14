import { hash } from "node:crypto";
import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { putBlob } from "@/lib/blob";
import { db, jobs, operations } from "@/lib/db";
import { OPERATIONS, STEP } from "@/lib/operations";
import { isPdf, validatePdf } from "@/lib/upload";
import { parseJob } from "@/workflows/parse";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const upload = file instanceof File ? file : null;
  const error = validatePdf(upload);
  if (error || !upload)
    return Response.json({ error: error ?? "no file" }, { status: 400 });
  const bytes = new Uint8Array(await upload.arrayBuffer());
  if (!isPdf(bytes))
    return Response.json({ error: "not a PDF" }, { status: 400 });

  const id = crypto.randomUUID();
  await putBlob(`${id}/source.pdf`, bytes, "application/pdf");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(jobs).values({
      id,
      filename: upload.name,
      size: bytes.byteLength,
      sha256: hash("sha256", bytes),
    });
    await tx.insert(operations).values(
      OPERATIONS.map((name, position) => ({
        jobId: id,
        step: STEP,
        name,
        position,
        status: name === "upload" ? ("done" as const) : ("pending" as const),
        startedAt: name === "upload" ? now : null,
        finishedAt: name === "upload" ? now : null,
      })),
    );
  });

  let run;
  try {
    run = await start(parseJob, [id]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(jobs)
      .set({ status: "failed", error: message, finishedAt: new Date() })
      .where(eq(jobs.id, id));
    return Response.json({ error: "could not start the job" }, { status: 500 });
  }
  await db
    .update(jobs)
    .set({ workflowRunId: run.runId })
    .where(eq(jobs.id, id));
  return Response.json({ id }, { status: 202 });
}
