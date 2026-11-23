import {
  readDocument,
  writeDocument,
  writeGraph,
} from "@dark-factory/knowledge-graph";
import { analyze, toParsedDocument } from "@dark-factory/parse";
import { eq } from "drizzle-orm";
import { FatalError } from "workflow";
import { getBlob, putBlob } from "@/lib/blob";
import { db, jobs } from "@/lib/db";
import { checkDocument, engineerDocument } from "@/lib/engineer";
import { runOperation, setOperation } from "@/lib/operations";

async function setJob(jobId: string, patch: Partial<typeof jobs.$inferInsert>) {
  "use step";
  await db().update(jobs).set(patch).where(eq(jobs.id, jobId));
}

async function parseOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "parse", "parse", async () => {
    const [job] = await db().select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) throw new FatalError("job missing");
    const pdf = await getBlob(`${jobId}/source.pdf`);
    if (!pdf) throw new FatalError("source.pdf missing");
    const { result, figures } = await analyze(pdf);
    for (const { id, png } of figures)
      await putBlob(`${jobId}/figures/${id}.png`, png, "image/png");
    const doc = toParsedDocument(result, job.sha256);
    await writeDocument(jobId, doc);
  });
}

async function engineerOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "engineer", "engineer", async () => {
    const doc = await readDocument(jobId);
    if (!doc) throw new FatalError("document missing from the knowledge graph");
    await engineerDocument(jobId, doc);
  });
}

async function checkOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "engineer", "check", async () => {
    const doc = await readDocument(jobId);
    if (!doc) throw new FatalError("document missing from the knowledge graph");
    const { graph, result } = await checkDocument(jobId, doc);
    await setOperation(jobId, "engineer", "check", {
      warnings: (result.failures.length > 0
        ? result.failures
        : result.warnings
      ).map((issue) => `${issue.code}: ${issue.message}`),
    });
    if (!graph) {
      throw new FatalError(
        `check rejected: ${result.failures
          .slice(0, 8)
          .map((issue) => issue.message)
          .join("; ")}`,
      );
    }
    await writeGraph(jobId, graph);
  });
}

/** One job down Station 1: parse the document, then the engineer builds the graph and the check stores it. */
export async function runJob(jobId: string) {
  "use workflow";
  await setJob(jobId, { status: "running" });
  try {
    await parseOperation(jobId);
    await engineerOperation(jobId);
    await checkOperation(jobId);
    await setJob(jobId, { status: "done", finishedAt: new Date() });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await setJob(jobId, { status: "failed", error, finishedAt: new Date() });
    throw err;
  }
}
