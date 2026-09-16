import {
  analyze,
  toParsedDocument,
  type ParsedDocument,
} from "@dark-factory/parse";
import {
  anchors,
  chunk,
  runClassify,
  runMentions,
  validate,
  type ModelOutput,
} from "@dark-factory/annotate";
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

async function classifyOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "annotate", "classify", async () => {
    const doc = await readJson<ParsedDocument>(`${jobId}/parsed.json`);
    const chunks = chunk(doc);
    // ponytail: all chunks in flight at once; add a concurrency cap if Azure rate limits bite.
    await Promise.all(
      chunks.map(async (text, i) => {
        const rows = await runClassify(text);
        await putBlob(
          `${jobId}/annotate/classify/${i}.json`,
          json(rows),
          "application/json",
        );
      }),
    );
    return { chunks: chunks.length };
  });
}

async function mentionsOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "annotate", "mentions", async () => {
    const doc = await readJson<ParsedDocument>(`${jobId}/parsed.json`);
    const chunks = chunk(doc);
    await Promise.all(
      chunks.map(async (text, i) => {
        const rows = await runMentions(text);
        await putBlob(
          `${jobId}/annotate/mentions/${i}.json`,
          json(rows),
          "application/json",
        );
      }),
    );
    return { chunks: chunks.length };
  });
}

async function validateOperation(jobId: string) {
  "use step";
  return runOperation(jobId, "annotate", "validate", async () => {
    const doc = await readJson<ParsedDocument>(`${jobId}/parsed.json`);
    const n = chunk(doc).length;
    const indexes = Array.from({ length: n }, (_, i) => i);
    const [classifications, mentions] = await Promise.all([
      Promise.all(
        indexes.map((i) =>
          readJson<ModelOutput["classifications"]>(
            `${jobId}/annotate/classify/${i}.json`,
          ),
        ),
      ),
      Promise.all(
        indexes.map((i) =>
          readJson<ModelOutput["mentions"]>(
            `${jobId}/annotate/mentions/${i}.json`,
          ),
        ),
      ),
    ]);
    const result = validate(
      { classifications: classifications.flat(), mentions: mentions.flat() },
      anchors(doc),
      doc.content,
    );
    await putBlob(`${jobId}/annotate.json`, json(result), "application/json");
    return {
      classifications: result.classifications.length,
      mentions: result.mentions.length,
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
    await Promise.all([classifyOperation(jobId), mentionsOperation(jobId)]);
    const counts = await validateOperation(jobId);
    await setJob(jobId, { status: "done", finishedAt: new Date() });
    return counts;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await setJob(jobId, { status: "failed", error, finishedAt: new Date() });
    throw err;
  }
}
