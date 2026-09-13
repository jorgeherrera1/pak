/**
 * Replays recorded model responses through validate; no network. To re-record:
 * run `test:integration`, copy `test/out/<sha256>/annotate/` into
 * `test/fixtures/annotate-responses/` and `annotations.json` into
 * `test/fixtures/`, and review the diff like code.
 */
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { anchors } from "../src/chunk.ts";
import { validate, type ModelOutput } from "../src/validate.ts";
import { doc } from "./doc.ts";

const dir = new URL("./fixtures/annotate-responses/", import.meta.url);
const outputs: ModelOutput[] = readdirSync(dir)
  .sort((a, b) => parseInt(a) - parseInt(b))
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));

test("replayed annotations match the recording", () => {
  const result = validate(
    {
      annotations: outputs.flatMap((o) => o.annotations),
      mentions: outputs.flatMap((o) => o.mentions),
    },
    anchors(doc),
    doc.content,
  );
  for (const a of [...result.annotations, ...result.mentions]) {
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
});
