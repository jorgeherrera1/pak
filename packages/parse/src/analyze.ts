import DocumentIntelligence, {
  getLongRunningPoller,
  isUnexpected,
  parseResultIdFromResponse,
  streamToUint8Array,
  type AnalyzeOperationOutput,
  type AnalyzeResultOutput,
} from "@azure-rest/ai-document-intelligence";
import { STRING_INDEX_TYPE } from "./toParsedDocument.ts";

const MODEL = "prebuilt-layout";
const API_VERSION = "2024-11-30";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export type Analysis = {
  result: AnalyzeResultOutput;
  figures: { id: string; png: Uint8Array }[];
};

/** Sends the PDF to Azure Document Intelligence and returns the raw result plus every figure image. */
export async function analyze(pdf: Buffer): Promise<Analysis> {
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

  const resultId = parseResultIdFromResponse(initial);
  const figures: Analysis["figures"] = [];
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
    figures.push({ id, png: await streamToUint8Array(res.body) });
  }
  return { result, figures };
}
