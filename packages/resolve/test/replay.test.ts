/**
 * Replays recorded model responses through both checks; no network. To
 * re-record: run `test:integration`, copy `test/out/<sha256>/resolve/` into
 * `test/fixtures/resolve-responses/` and `resolve.json` into `test/fixtures/`,
 * and review the diff like code.
 */
import { anchors } from "@dark-factory/annotate";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { groundEntities, groundLinks } from "../src/ground.ts";
import { linkInputs } from "../src/inputs.ts";
import { classifications, doc } from "./doc.ts";

const fixture = (path: string) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${path}`, import.meta.url), "utf8"),
  );

test("replayed entities and links match the recording", () => {
  const { entities, possiblySameAs, warnings } = groundEntities(
    fixture("resolve-responses/entities.json"),
    anchors(doc),
    doc.content,
  );
  for (const e of entities)
    for (const m of e.mentions)
      expect(
        doc.content.slice(m.span.offset, m.span.offset + m.span.length),
      ).toBe(m.text);
  const answers = linkInputs(doc, classifications, entities).map(
    ({ asked }, i) => ({
      asked,
      rows: fixture(`resolve-responses/link/${i}.json`),
    }),
  );
  const linked = groundLinks(answers, entities, classifications);
  expect({
    entities,
    possiblySameAs,
    links: linked.links,
    warnings: [...warnings, ...linked.warnings],
  }).toEqual(fixture("resolve.json"));
});
