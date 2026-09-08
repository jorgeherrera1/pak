/**
 * Replays recorded model responses; no network. To re-record: run
 * `test:integration`, copy `test/out/<sha256>/annotate/<key>/responses/` into
 * `test/fixtures/annotate-responses/` and `annotations.json` into
 * `test/fixtures/`, and review the diff like code.
 */
import type { ParsedDocument } from "@dark-factory/parse";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { annotate } from "../src/annotate.ts";

const responses = fileURLToPath(
  new URL("./fixtures/annotate-responses/", import.meta.url),
);
const doc: ParsedDocument = JSON.parse(
  readFileSync(
    new URL("../../parse/test/fixtures/parsed.json", import.meta.url),
    "utf8",
  ),
);

test.skipIf(!existsSync(responses))(
  "replayed annotations match the recording",
  async () => {
    const result = await annotate(doc, responses);
    for (const a of result.annotations) {
      expect(
        doc.content.slice(a.span.offset, a.span.offset + a.span.length),
      ).toBe(a.text);
    }
    const golden = JSON.parse(
      readFileSync(
        new URL("./fixtures/annotations.json", import.meta.url),
        "utf8",
      ),
    );
    expect(result).toEqual(golden);
  },
);
