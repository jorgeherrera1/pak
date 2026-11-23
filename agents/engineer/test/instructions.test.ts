import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { renderInstructions } from "@dark-factory/srs";

test("instructions.md is the vocabulary, not a second copy", () => {
  const file = readFileSync(
    new URL("../bot/instructions.md", import.meta.url),
    "utf8",
  );
  expect(file).toBe(renderInstructions());
});
