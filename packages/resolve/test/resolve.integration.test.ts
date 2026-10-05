/**
 * Live run against Azure AI Foundry, plus the eval: entities and links scored
 * against `fixtures/expected-entities.json` and `fixtures/expected-links.json`,
 * which are written by a human, never generated. Needs AZURE_FOUNDRY_ENDPOINT
 * and AZURE_API_KEY in the repo-root .env.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { resolve } from "../src/resolve.ts";
import { classifications, doc } from "./doc.ts";
import {
  scoreEntities,
  scoreLinks,
  type Named,
  type WantLink,
} from "./score.ts";

const env = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);

const out = fileURLToPath(new URL("./out/", import.meta.url));
/** An answer key, or undefined until a human has written it. */
function key<T>(name: string): T | undefined {
  const file = new URL(`./fixtures/${name}`, import.meta.url);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

// Raised by a human after reading the first scored run. 0 means "record, don't gate yet".
const FLOOR = 0;

test("live resolve and eval", { timeout: 600_000 }, async () => {
  rmSync(out, { recursive: true, force: true });
  const { entities, possiblySameAs, links, warnings } = await resolve(
    doc,
    classifications,
    out,
  );

  const namesOf = new Map(
    entities.map((e) => [e.id, [...new Set(e.mentions.map((m) => m.text))]]),
  );
  const mentions = entities.reduce((sum, e) => sum + e.mentions.length, 0);
  const linked = new Set(
    links.map((l) => `${l.classificationId}|${l.entityId}`),
  );
  // A classification whose own text names an entity the model did not link it to.
  const unlinked = classifications.flatMap((c) =>
    entities
      .filter(
        (e) =>
          !linked.has(`${c.id}|${e.id}`) &&
          e.mentions.some(
            (m) =>
              m.span.offset >= c.span.offset &&
              m.span.offset + m.span.length <= c.span.offset + c.span.length,
          ),
      )
      .map((e) => `${c.id} names ${JSON.stringify(e.name)}`),
  );
  const dropped = warnings.filter((w) => w.includes(", dropped from ")).length;
  console.log(
    `${entities.length} entities, ${mentions} mentions, ${dropped} names dropped, ${possiblySameAs.length} possibly-same pairs; ${links.length} links, ${unlinked.length} named but not linked; ${warnings.length} warnings`,
  );
  for (const e of entities)
    console.log(`  ${e.id} ${e.kind}: ${namesOf.get(e.id)!.join("; ")}`);
  for (const [a, b] of possiblySameAs)
    console.log(`  possibly same: ${a} ${b}`);
  for (const w of warnings) console.log(`  warning: ${w}`);
  for (const u of unlinked) console.log(`  not linked: ${u}`);
  expect(entities.length).toBeGreaterThan(0);

  const wantEntities = key<{ entities: Named[] }>("expected-entities.json");
  if (!wantEntities) {
    console.log(
      "fixtures/expected-entities.json missing: recorded, not scored",
    );
    return;
  }
  const scores = scoreEntities(
    entities.map((e) => ({ kind: e.kind, names: namesOf.get(e.id)! })),
    wantEntities.entities,
  );
  console.table({
    "names found": scores.found,
    "names grouped": scores.grouped,
  });
  console.log(`kinds right: ${scores.kinds}`);
  for (const [name, { precision, recall }] of Object.entries({
    "names found": scores.found,
    "names grouped": scores.grouped,
  })) {
    expect(precision, `${name} precision`).toBeGreaterThanOrEqual(FLOOR);
    expect(recall, `${name} recall`).toBeGreaterThanOrEqual(FLOOR);
  }
  expect(scores.kinds, "kinds").toBeGreaterThanOrEqual(FLOOR);

  const wantLinks = key<{ links: WantLink[] }>("expected-links.json");
  if (!wantLinks) {
    console.log(
      "fixtures/expected-links.json missing: links recorded, not scored",
    );
    return;
  }
  const byId = new Map(classifications.map((c) => [c.id, c]));
  const linkScores = scoreLinks(
    links.map((l) => {
      const c = byId.get(l.classificationId)!;
      return {
        elementId: c.elementId,
        type: c.type,
        names: namesOf.get(l.entityId)!,
      };
    }),
    wantLinks.links,
    wantEntities.entities,
  );
  console.table({ links: linkScores });
  expect(linkScores.precision, "links precision").toBeGreaterThanOrEqual(FLOOR);
  expect(linkScores.recall, "links recall").toBeGreaterThanOrEqual(FLOOR);
});
