import { analyze, toParsedDocument } from "@dark-factory/parse";
import { anchors, chunk, ground, runAnnotate } from "@dark-factory/annotate";
import {
  readDocument,
  writeDocument,
  writeRequirements,
} from "@dark-factory/knowledge-graph";
import { eq } from "drizzle-orm";
import { FatalError } from "workflow";
import { getBlob, putBlob } from "@/lib/blob";
import { db, jobs } from "@/lib/db";
import { runOperation, setOperation } from "@/lib/operations";

async function setJob(jobId: string, patch: Partial<typeof jobs.$inferInsert>) {
  "use step";
  await db.update(jobs).set(patch).where(eq(jobs.id, jobId));
}

async function parseOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "parse", "parse", async () => {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) throw new FatalError("job missing");
    const pdf = await getBlob(`${jobId}/source.pdf`);
    if (!pdf) throw new FatalError("source.pdf missing");
    const { result, figures } = await analyze(pdf);
    for (const { id, png } of figures)
      await putBlob(`${jobId}/figures/${id}.png`, png, "image/png");
    const doc = toParsedDocument(result, job.sha256);
    await writeDocument(jobId, doc);
    return { elements: doc.elements.length, warnings: doc.warnings.length };
  });
}

async function annotateOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "annotate", "annotate", async () => {
    const doc = await readDocument(jobId);
    if (!doc) throw new FatalError("document missing from the knowledge graph");
    // ponytail: all chunks in flight at once; add a concurrency cap if Azure rate limits bite.
    const rows = (await Promise.all(chunk(doc).map(runAnnotate))).flat();
    const result = ground(rows, anchors(doc), doc.content);
    await writeRequirements(jobId, result.classifications);
    // Grounding warnings describe this run, not the document; runOperation's done patch leaves them in place.
    await setOperation(jobId, "annotate", "annotate", {
      warnings: result.warnings,
    });
    return {
      requirements: result.classifications.length,
      warnings: result.warnings.length,
    };
  });
}

/** One job down Station 1: Parse, then Annotate. The knowledge graph is the only thing that crosses a step boundary. */
export async function runJob(jobId: string) {
  "use workflow";
  await setJob(jobId, { status: "running" });
  try {
    await parseOperation(jobId);
    const counts = await annotateOperation(jobId);
    await setJob(jobId, { status: "done", finishedAt: new Date() });
    return counts;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await setJob(jobId, { status: "failed", error, finishedAt: new Date() });
    throw err;
  }
}
