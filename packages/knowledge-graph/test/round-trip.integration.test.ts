/**
 * Needs local Postgres with AGE preloaded and the `knowledge_graph` graph
 * (apps/web's migration). Reads WORKFLOW_POSTGRES_URL from the repo-root .env.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import type { AnnotateResult } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import {
  readDocument,
  readRequirements,
  writeDocument,
  writeRequirements,
} from "../src/index.ts";

const env = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);

const packages = new URL("../../", import.meta.url);
const doc: ParsedDocument = JSON.parse(
  readFileSync(new URL("parse/test/fixtures/parsed.json", packages), "utf8"),
);
const golden: AnnotateResult = JSON.parse(
  readFileSync(
    new URL("annotate/test/fixtures/annotate.json", packages),
    "utf8",
  ),
);

/** Fixed ids, so re-runs overwrite instead of piling up. */
const jobId = "fixture-round-trip";
const escapes: ParsedDocument = {
  source: { sha256: "x", pages: 1 },
  content: "$$ 'q' \"r\"\nend",
  elements: [
    {
      id: "paragraphs/0",
      parent: null,
      kind: "paragraph",
      text: "$$ 'q' \"r\"",
      region: [],
      span: [{ offset: 0, length: 10 }],
    },
  ],
  warnings: ["w"],
};

test("the recorded document survives a round trip", async () => {
  await writeDocument(jobId, doc);
  await writeDocument(jobId, doc); // a retried step must not duplicate
  expect(await readDocument(jobId)).toEqual(doc);

  await writeDocument("fixture-escapes", escapes);
  expect(await readDocument("fixture-escapes")).toEqual(escapes);

  expect(await readDocument("no-such-job")).toBeNull();
});

test("the recorded requirements survive a round trip", async () => {
  await writeDocument(jobId, doc);
  await writeRequirements(jobId, golden.classifications);
  await writeRequirements(jobId, golden.classifications); // a retried step must not duplicate
  expect(await readRequirements(jobId)).toEqual(golden.classifications);
});
