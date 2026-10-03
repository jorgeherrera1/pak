/**
 * Replays recorded model responses through ground; no network. To re-record:
 * run `test:integration`, copy `test/out/<sha256>/annotate/` into
 * `test/fixtures/annotate-responses/` and `annotate.json` into
 * `test/fixtures/`, and review the diff like code.
 */
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { anchors } from "../src/chunk.ts";
import { ground, type ClassificationRow } from "../src/ground.ts";
import { doc } from "./doc.ts";

const dir = new URL("./fixtures/annotate-responses/", import.meta.url);
const responses: ClassificationRow[] = readdirSync(dir)
  .sort((a, b) => parseInt(a) - parseInt(b))
  .flatMap((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));

test("replayed classifications match the recording", () => {
  const result = ground(responses, anchors(doc), doc.content);
  for (const a of result.classifications) {
    expect(
      doc.content.slice(a.span.offset, a.span.offset + a.span.length),
    ).toBe(a.text);
  }
  const golden = JSON.parse(
    readFileSync(new URL("./fixtures/annotate.json", import.meta.url), "utf8"),
  );
  expect(result).toEqual(golden);
});
