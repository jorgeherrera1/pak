import { expect, test } from "vitest";
import { groundEntities, type EntityRow } from "../src/ground.ts";
import type { Entity } from "@dark-factory/contracts";

const lines = [
  "Accounts",
  "The account holder opens an Account. Each account has one Account Holder.",
  "A ledger lists every account’s entries.",
  "The İZMİR branch keeps a ledger.",
  "figure: the account holder signs",
];
const content = lines.join("\n");
const span = (text: string) => [
  { offset: content.indexOf(text), length: text.length },
];
const anchors = new Map([
  ["paragraphs/0", span(lines[0]!)],
  ["paragraphs/1", span(lines[1]!)],
  ["paragraphs/2", span(lines[2]!)],
  ["paragraphs/3", span(lines[3]!)],
  // A figure covers the paragraph inside it, as Parse reports them.
  ["figures/0", span(lines[4]!)],
  ["paragraphs/4", span("the account holder signs")],
]);
const row = (
  kind: EntityRow["kind"],
  name: string,
  names: string[] = [name],
  possiblySameAs: string[] = [],
): EntityRow => ({ kind, name, names, possiblySameAs });
const holder = row("user-class", "account holder");
const account = row("data-entity", "account", ["account", "accounts"]);
const ledger = row("data-entity", "ledger");
const where = (e: Entity) => e.mentions.map((m) => [m.elementId, m.text]);

test("a name is found wherever it occurs, with the source's text and its exact span", () => {
  const { entities, warnings } = groundEntities(
    [account, row("integration", "İZMİR branch")],
    anchors,
    content,
  );
  expect(warnings).toEqual([]);
  expect(entities.map((e) => [e.id, e.kind, e.name])).toEqual([
    ["e1", "data-entity", "account"],
    ["e2", "integration", "İZMİR branch"],
  ]);
  expect(where(entities[0]!)).toEqual([
    ["paragraphs/0", "Accounts"],
    ["paragraphs/1", "account"],
    ["paragraphs/1", "Account"],
    ["paragraphs/1", "account"],
    ["paragraphs/1", "Account"],
    ["paragraphs/2", "account"],
    ["paragraphs/4", "account"],
  ]);
  for (const e of entities)
    for (const m of e.mentions)
      expect(content.slice(m.span.offset, m.span.offset + m.span.length)).toBe(
        m.text,
      );
});

test("of two overlapping names the longer takes the mention", () => {
  const { entities } = groundEntities([account, holder], anchors, content);
  expect(where(entities[1]!)).toEqual([
    ["paragraphs/1", "account holder"],
    ["paragraphs/1", "Account Holder"],
    ["paragraphs/4", "account holder"],
  ]);
  expect(where(entities[0]!)).toEqual([
    ["paragraphs/0", "Accounts"],
    ["paragraphs/1", "Account"],
    ["paragraphs/1", "account"],
    ["paragraphs/2", "account"],
  ]);
});

test("text a figure shares with the paragraph inside it is mentioned once, on the paragraph", () => {
  const { entities } = groundEntities([holder], anchors, content);
  expect(entities[0]!.mentions.map((m) => m.elementId)).toEqual([
    "paragraphs/1",
    "paragraphs/1",
    "paragraphs/4",
  ]);
});

test("a figure that is exactly one paragraph gives the mention to the paragraph", () => {
  const same = span("the account holder signs");
  const { entities } = groundEntities(
    [holder],
    // Parse lists the figure first, then the paragraph inside it.
    new Map([
      ["figures/9", same],
      ["paragraphs/9", same],
    ]),
    content,
  );
  expect(where(entities[0]!)).toEqual([["paragraphs/9", "account holder"]]);
});

test("a name found only inside a longer name is dropped, and the warning says so", () => {
  const { entities, warnings } = groundEntities(
    [holder, row("glossary-term", "holder")],
    anchors,
    content,
  );
  expect(entities.map((e) => e.name)).toEqual(["account holder"]);
  expect(warnings).toEqual([
    '"holder": found only inside a longer name, dropped from "holder"',
    '"holder": no mention of its own, entity dropped',
  ]);
});

test("a name that never occurs is dropped, and so is an entity left with no mention", () => {
  const { entities, warnings } = groundEntities(
    [
      holder,
      row("standard", "ISO 9001"),
      row("data-entity", "ledger", ["ledger", "general ledger"]),
    ],
    anchors,
    content,
  );
  expect(entities.map((e) => [e.id, e.name])).toEqual([
    ["e1", "account holder"],
    ["e2", "ledger"],
  ]);
  expect(warnings).toEqual([
    '"ISO 9001": not in the text, dropped from "ISO 9001"',
    '"general ledger": not in the text, dropped from "ledger"',
    '"ISO 9001": no mention of its own, entity dropped',
  ]);
});

test("a name two rows claim stays with the first, and a row that repeats an entity is dropped", () => {
  const { entities, warnings } = groundEntities(
    [account, ledger, row("glossary-term", "Account", ["account", "Accounts"])],
    anchors,
    content,
  );
  expect(entities.map((e) => [e.id, e.kind])).toEqual([
    ["e1", "data-entity"],
    ["e2", "data-entity"],
  ]);
  expect(warnings).toEqual([
    '"Account": already a name of "account", dropped from "Account"',
    '"account": already a name of "account", dropped from "Account"',
    '"Accounts": already a name of "account", dropped from "Account"',
    '"Account": no mention of its own, entity dropped',
  ]);
});

test("the name is the source's spelling of the model's choice, or of the most used name when the choice is not in the text", () => {
  const { entities } = groundEntities(
    [
      row("user-class", "ACCOUNT HOLDER", ["account holder"]),
      row("data-entity", "Customer Account", ["accounts", "account"]),
      // The model named the entity but listed no names.
      row("data-entity", "Ledger", []),
    ],
    anchors,
    content,
  );
  expect(entities.map((e) => e.name)).toEqual([
    "account holder",
    "Account",
    "ledger",
  ]);
});

test("possiblySameAs becomes pairs of entity ids, and a name that is not another entity is dropped", () => {
  const { possiblySameAs, warnings } = groundEntities(
    [
      row("data-entity", "ledger", ["ledger"], ["account", "nobody", "ledger"]),
      row("data-entity", "account", ["account"], ["ledger"]),
    ],
    anchors,
    content,
  );
  expect(possiblySameAs).toEqual([["e1", "e2"]]);
  expect(warnings).toEqual([
    '"ledger": possiblySameAs "nobody" is not another entity, dropped',
    '"ledger": possiblySameAs "ledger" is not another entity, dropped',
  ]);
});
