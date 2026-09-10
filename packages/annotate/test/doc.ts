import type { ParsedDocument } from "@dark-factory/parse";
import { readFileSync } from "node:fs";

/** Parse's recorded output, the only ParsedDocument fixture there is. Re-record via parse's test:integration. */
export const doc: ParsedDocument = JSON.parse(
  readFileSync(
    new URL("../../parse/test/fixtures/parsed.json", import.meta.url),
    "utf8",
  ),
);
