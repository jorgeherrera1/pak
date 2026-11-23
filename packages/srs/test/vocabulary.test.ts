import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  entityTypes,
  prefixCodes,
  RELATIONS,
  renderInstructions,
  statementTypes,
  TYPES,
} from "../src/index.ts";

const html = readFileSync(
  new URL("../../../docs/srs-template.html", import.meta.url),
  "utf8",
);

const identifierPrefixes = () => {
  const section = html.split("Requirement identifiers")[1]?.split("<h3>")[0];
  if (!section) throw new Error("section 0.2 identifiers not found");
  return [...section.matchAll(/<code>([^<]+)<\/code>/g)].map((match) => {
    const code = match[1] ?? "";
    const category = code.match(/^([A-Z]+)-CAT-/);
    if (category) return category[1] ?? "";
    return code.match(/^([A-Z]+)-/)?.[1] ?? code;
  });
};

test("every section 0.2 prefix is in the vocabulary, and every vocabulary prefix is in the template", () => {
  const declared = new Set(prefixCodes());
  for (const prefix of identifierPrefixes()) {
    expect(declared.has(prefix), prefix).toBe(true);
  }
  for (const prefix of declared) {
    expect(html.includes(prefix), prefix).toBe(true);
  }
});

test("every vocabulary type is named in the template, and the two sides are disjoint", () => {
  for (const type of TYPES) expect(html.includes(type.template), type.slug).toBe(true);
  const statements = new Set(statementTypes().map((type) => type.slug));
  const entities = new Set(entityTypes().map((type) => type.slug));
  for (const slug of statements) expect(entities.has(slug)).toBe(false);
  expect(new Set(TYPES.map((type) => type.slug)).size).toBe(TYPES.length);
});

test("the instructions name every type and relation", () => {
  const text = renderInstructions();
  for (const type of TYPES) expect(text).toContain(type.slug);
  for (const relation of RELATIONS) expect(text).toContain(relation.name);
  expect(text).toContain("call finish");
});
