import DocumentIntelligence, {
  getLongRunningPoller,
  isUnexpected,
  parseResultIdFromResponse,
  streamToUint8Array,
  type AnalyzeOperationOutput,
  type AnalyzeResultOutput,
} from "@azure-rest/ai-document-intelligence";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { STRING_INDEX_TYPE } from "./toParsedDocument.ts";

const MODEL = "prebuilt-layout";
const API_VERSION = "2024-11-30";

/** True when `a` came from the exact request `analyze` makes now; anything else is stale. */
export const isCurrent = (a: AnalyzeResultOutput): boolean =>
  a.modelId === MODEL &&
  a.apiVersion === API_VERSION &&
  a.stringIndexType === STRING_INDEX_TYPE;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Sends the PDF to Azure Document Intelligence and persists the raw result:
 * `<dir>/figures/<id>.png` for every figure, then `<dir>/analysis.json` last,
 * so a half-finished run never looks complete.
 */
export async function analyze(
  pdf: Buffer,
  dir: string,
): Promise<AnalyzeResultOutput> {
  const client = DocumentIntelligence(
    env("AZURE_DI_ENDPOINT"),
    { key: env("AZURE_DI_KEY") },
    { apiVersion: API_VERSION },
  );

  const initial = await client
    .path("/documentModels/{modelId}:analyze", MODEL)
    .post({
      contentType: "application/json",
      body: { base64Source: pdf.toString("base64") },
      queryParameters: {
        output: ["figures"],
        stringIndexType: STRING_INDEX_TYPE,
      },
    });
  if (isUnexpected(initial))
    throw new Error(JSON.stringify(initial.body.error));

  const done = (await getLongRunningPoller(client, initial).pollUntilDone())
    .body as AnalyzeOperationOutput;
  const result = done.analyzeResult;
  if (!result)
    throw new Error(`analysis ${done.status}: ${JSON.stringify(done.error)}`);

  await mkdir(join(dir, "figures"), { recursive: true });
  const resultId = parseResultIdFromResponse(initial);
  for (const { id } of result.figures ?? []) {
    if (!id) continue;
    const res = await client
      .path(
        "/documentModels/{modelId}/analyzeResults/{resultId}/figures/{figureId}",
        MODEL,
        resultId,
        id,
      )
      .get()
      .asNodeStream();
    if (res.status !== "200" || !res.body)
      throw new Error(`figure ${id}: HTTP ${res.status}`);
    await writeFile(
      join(dir, "figures", `${id}.png`),
      await streamToUint8Array(res.body),
    );
  }

  await writeFile(join(dir, "analysis.json"), JSON.stringify(result, null, 2));
  return result;
}
