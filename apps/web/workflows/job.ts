import {
  analyze,
  toParsedDocument,
  type ParsedDocument,
} from "@dark-factory/parse";
import { anchors, chunk, ground, runAnnotate } from "@dark-factory/annotate";
import type { AnalyzeResultOutput } from "@azure-rest/ai-document-intelligence";
import { eq } from "drizzle-orm";
import { FatalError } from "workflow";
import { getBlob, putBlob } from "@/lib/blob";
import { db, jobs } from "@/lib/db";
import { runOperation } from "@/lib/operations";

const json = (data: unknown) => new TextEncoder().encode(JSON.stringify(data));

async function readJson<T>(path: string): Promise<T> {
  const raw = await getBlob(path);
  if (!raw) throw new FatalError(`${path} missing`);
  try {
    return JSON.parse(raw.toString("utf8")) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FatalError(`${path} is not valid JSON: ${message}`);
  }
}

async function setJob(jobId: string, patch: Partial<typeof jobs.$inferInsert>) {
  "use step";
  await db.update(jobs).set(patch).where(eq(jobs.id, jobId));
}

async function analyzeOperation(jobId: string) {
  "use step";
  await runOperation(jobId, "parse", "analyze", async () => {
    const pdf = await getBlob(`${jobId}/source.pdf`);
    if (!pdf) throw new FatalError("source.pdf missing");
    const { result, figures } = await analyze(pdf);
    for (const { id, png } of figures)
      await putBlob(`${jobId}/figures/${id}.png`, png, "image/png");
    await putBlob(`${jobId}/analysis.json`, json(result), "application/json");
  });
}

async function buildOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "parse", "build", async () => {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) throw new FatalError("job missing");
    const result = await readJson<AnalyzeResultOutput>(
      `${jobId}/analysis.json`,
    );
    const doc = toParsedDocument(result, job.sha256);
    await putBlob(`${jobId}/parsed.json`, json(doc), "application/json");
    return { elements: doc.elements.length, warnings: doc.warnings.length };
  });
}

async function annotateOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "annotate", "annotate", async () => {
    const doc = await readJson<ParsedDocument>(`${jobId}/parsed.json`);
    // ponytail: all chunks in flight at once; add a concurrency cap if Azure rate limits bite.
    const rows = (await Promise.all(chunk(doc).map(runAnnotate))).flat();
    const result = ground(rows, anchors(doc), doc.content);
    await putBlob(`${jobId}/annotate.json`, json(result), "application/json");
    return {
      classifications: result.classifications.length,
      warnings: result.warnings.length,
    };
  });
}

/** One job down Station 1: Parse's operations, then Annotate's. */
export async function runJob(jobId: string) {
  "use workflow";
  await setJob(jobId, { status: "running" });
  try {
    await analyzeOperation(jobId);
    await buildOperation(jobId);
    const counts = await annotateOperation(jobId);
    await setJob(jobId, { status: "done", finishedAt: new Date() });
    return counts;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await setJob(jobId, { status: "failed", error, finishedAt: new Date() });
    throw err;
  }
}
