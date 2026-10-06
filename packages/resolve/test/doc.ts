import type { AnnotateResult } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import { readFileSync } from "node:fs";

const fixture = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));

/** Parse's and Annotate's recordings of the one fixture document. Re-record via their test:integration. */
export const doc: ParsedDocument = fixture("parse/test/fixtures/parsed.json");
export const { classifications }: AnnotateResult = fixture(
  "annotate/test/fixtures/annotate.json",
);
