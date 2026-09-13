import { analyze, toParsedDocument } from "@dark-factory/parse";
import type { AnalyzeResultOutput } from "@azure-rest/ai-document-intelligence";
import { eq } from "drizzle-orm";
import { FatalError } from "workflow";
import { getBlob, putBlob } from "../lib/blob";
import { db, jobs } from "../lib/db";
import { runOperation } from "../lib/operations";

async function setJob(jobId: string, patch: Partial<typeof jobs.$inferInsert>) {
  "use step";
  await db.update(jobs).set(patch).where(eq(jobs.id, jobId));
}

async function analyzeOperation(jobId: string) {
  "use step";
  await runOperation(jobId, "analyze", async () => {
    const pdf = await getBlob(`${jobId}/source.pdf`);
    if (!pdf) throw new FatalError("source.pdf missing");
    const { result, figures } = await analyze(pdf);
    for (const { id, png } of figures)
      await putBlob(`${jobId}/figures/${id}.png`, png, "image/png");
    await putBlob(
      `${jobId}/analysis.json`,
      new TextEncoder().encode(JSON.stringify(result)),
      "application/json",
    );
  });
}

async function buildOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "build", async () => {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) throw new FatalError("job missing");
    const raw = await getBlob(`${jobId}/analysis.json`);
    if (!raw) throw new FatalError("analysis.json missing");
    let result: AnalyzeResultOutput;
    try {
      result = JSON.parse(raw.toString("utf8"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new FatalError(`analysis.json is not valid JSON: ${message}`);
    }
    const doc = toParsedDocument(result, job.sha256);
    await putBlob(
      `${jobId}/parsed.json`,
      new TextEncoder().encode(JSON.stringify(doc)),
      "application/json",
    );
    return { elements: doc.elements.length, warnings: doc.warnings.length };
  });
}

async function publishOperation(jobId: string) {
  "use step";
  await runOperation(jobId, "publish", async () => {
    await db
      .update(jobs)
      .set({ status: "done", finishedAt: new Date() })
      .where(eq(jobs.id, jobId));
  });
}

export async function parseJob(jobId: string) {
  "use workflow";
  await setJob(jobId, { status: "running" });
  try {
    await analyzeOperation(jobId);
    const counts = await buildOperation(jobId);
    await publishOperation(jobId);
    return counts;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await setJob(jobId, { status: "failed", error, finishedAt: new Date() });
    throw err;
  }
}
