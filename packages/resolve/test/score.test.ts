import { expect, test } from "vitest";
import { scoreEntities, scoreLinks, type Named } from "./score.ts";

const want: Named[] = [
  { kind: "user-class", names: ["alpha", "alfa"] },
  { kind: "data-entity", names: ["beta", "betas"] },
  { kind: "data-entity", names: ["gamma"] },
];

test("entities are scored on names found, names grouped and kinds", () => {
  const got: Named[] = [
    // One key entity split in two, the second with the wrong kind.
    { kind: "user-class", names: ["Alpha"] },
    { kind: "glossary-term", names: ["alfa"] },
    // Two key entities merged.
    { kind: "data-entity", names: ["beta", "betas", "gamma"] },
    // Not in the key.
    { kind: "standard", names: ["delta"] },
  ];
  const s = scoreEntities(got, want);
  expect(s.found).toEqual({ precision: 5 / 6, recall: 1 });
  // alpha 1, alfa 1, beta 2/3, betas 2/3, gamma 1/3
  expect(s.grouped.precision).toBeCloseTo((1 + 1 + 2 / 3 + 2 / 3 + 1 / 3) / 5);
  // alpha 1/2, alfa 1/2, beta 1, betas 1, gamma 1
  expect(s.grouped.recall).toBeCloseTo((0.5 + 0.5 + 1 + 1 + 1) / 5);
  expect(s.kinds).toBe(4 / 5);
  expect(scoreEntities(want, want)).toEqual({
    found: { precision: 1, recall: 1 },
    grouped: { precision: 1, recall: 1 },
    kinds: 1,
  });
});

test("links are scored as element, type and entity, the entity matched by any shared name", () => {
  const s = scoreLinks(
    [
      { elementId: "paragraphs/1", type: "feature", names: ["ALFA", "x"] },
      { elementId: "paragraphs/1", type: "feature", names: ["delta"] },
      { elementId: "paragraphs/2", type: "feature", names: ["betas"] },
    ],
    [
      { elementId: "paragraphs/1", type: "feature", entity: "alpha" },
      { elementId: "paragraphs/2", type: "feature", entity: "gamma" },
    ],
    want,
  );
  expect(s).toEqual({ tp: 1, fp: 2, fn: 1, precision: 1 / 3, recall: 1 / 2 });
});
