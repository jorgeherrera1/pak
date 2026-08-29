import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "motivus.css"), "utf8");
const sharedCss = readFileSync(join(here, "shared-styles.css"), "utf8");

const DECLARATION = /(--[a-z0-9*-]+(?:--[a-z-]+)?)\s*:\s*([^;]+);/g;

function declarations(source: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [, name, value] of source.matchAll(DECLARATION)) {
    if (name!.includes("*")) continue; // wildcard resets like --color-*: initial
    map.set(name!, [...(map.get(name!) ?? []), value!.trim()]);
  }
  return map;
}

const tokens = declarations(css);

// Canonical brand values, cross-checked between motivus.com and the curated
// Motivus brand tokens. A mismatch here means the sheet drifted off-brand.
const CANONICAL_COLORS: Record<string, string> = {
  "--color-electric-blue": "#1e6fd9",
  "--color-action-hover": "#1859b5",
  "--color-bright-cyan": "#00b4d8",
  "--color-ice-blue": "#e8f2fb",
  "--color-pale-surface": "#f5f8fc",
  "--color-mint": "#75f0b2",
  "--color-mint-glow": "#00dcd1",
  "--color-lemon": "#e9fd71",
  "--color-deep-navy": "#0a1628",
  "--color-deepest": "#030619",
  "--color-ink": "#1d1d1d",
  "--color-graphite": "#383b4b",
  "--color-success": "#0d9e68",
  "--color-error": "#dc2626",
  "--color-indigo-800": "#111d81",
  "--color-lime-400": "#cde05d",
  "--color-gray-200": "#eeeeee",
  "--color-white": "#ffffff",
  "--color-black": "#000000",
};

test("core brand colors match the canonical values", () => {
  for (const [name, expected] of Object.entries(CANONICAL_COLORS)) {
    assert.deepEqual(tokens.get(name), [expected], name);
  }
});

test("no token is defined twice", () => {
  const duplicated = [...tokens.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([name]) => name);
  assert.deepEqual(duplicated, []);
});

test("every var() reference resolves to a defined token", () => {
  const unresolved = [...css.matchAll(/var\((--[a-z0-9-]+)\)/g)
    .map(([, name]) => name!)]
    .filter((name) => !tokens.has(name));
  assert.deepEqual(unresolved, []);
});

test("semantic roles alias the palette, not raw values", () => {
  const roles = [
    "--color-fg-1",
    "--color-bg-dark",
    "--color-border-subtle",
    "--color-action",
    "--color-accent",
    "--color-chart-1",
    "--color-chart-dark-1",
  ];
  for (const role of roles) {
    const [value] = tokens.get(role) ?? [];
    assert.match(value ?? "", /^var\(--color-[a-z0-9-]+\)$/, role);
  }
});

test("typography tokens carry the brand faces", () => {
  assert.match(tokens.get("--font-display")?.[0] ?? "", /^"DM Sans"/);
  assert.match(tokens.get("--font-body")?.[0] ?? "", /^Lato/);
  assert.deepEqual(tokens.get("--text-eyebrow--letter-spacing"), ["0.14em"]);
  assert.deepEqual(tokens.get("--text-chip--letter-spacing"), ["0.1em"]);
});

test("radius scale matches the extracted shape system", () => {
  assert.deepEqual(tokens.get("--radius-sm"), ["0.5rem"]); // buttons: 8px
  assert.deepEqual(tokens.get("--radius-lg"), ["1rem"]); // cards: 16px
});

test("strict palette: brand sheet resets Tailwind default colors", () => {
  assert.match(css, /--color-\*\s*:\s*initial/);
});

test("shared entrypoint pulls in tailwind and the brand tokens", () => {
  assert.match(sharedCss, /@import "tailwindcss";/);
  assert.match(sharedCss, /@import "\.\/motivus\.css";/);
});
