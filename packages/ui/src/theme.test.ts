import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "styles.css"), "utf8");
const motivusCss = readFileSync(
  join(here, "..", "..", "tailwind-config", "motivus.css"),
  "utf8",
);

// The shadcn semantic variables this theme must define.
const SHADCN_VARS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
] as const;

function block(startMarker: string): string {
  const start = css.indexOf(startMarker);
  expect(start, `block not found: ${startMarker}`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    if (depth === 0) return css.slice(open, i + 1);
  }
  throw new Error(`unterminated block: ${startMarker}`);
}

const light = block(":root");
const dark = block(".dark {");
const inline = block("@theme inline");

test("dark mode uses the documented class strategy", () => {
  expect(css).toContain("@custom-variant dark (&:is(.dark *));");
  expect(css).not.toContain("prefers-color-scheme");
});

test("light and dark themes define the full shadcn variable set", () => {
  for (const name of SHADCN_VARS) {
    expect(light).toMatch(new RegExp(`${name}\\s*:`));
    expect(dark).toMatch(new RegExp(`${name}\\s*:`));
  }
});

test("every shadcn variable is bridged into the Tailwind theme", () => {
  for (const name of SHADCN_VARS) {
    expect(inline).toContain(`--color-${name.slice(2)}: var(${name});`);
  }
});

test("theme values are assigned from Motivus tokens, not raw values", () => {
  for (const scope of [light, dark]) {
    for (const [, value] of scope.matchAll(/--[a-z-]+\s*:\s*([^;]+);/g)) {
      expect(value!.trim()).toMatch(/^var\(--color-[a-z0-9-]+\)$/);
    }
  }
});

test("every referenced Motivus token exists in the phase-1 sheet", () => {
  const referenced = new Set(
    [...css.matchAll(/var\((--color-[a-z0-9-]+)\)/g)].map(([, name]) => name!),
  );
  for (const name of referenced) {
    expect(motivusCss, `undefined token: ${name}`).toMatch(
      new RegExp(`${name}\\s*:`),
    );
  }
});

test("stylesheet imports tailwind, the tokens, and scans its own sources", () => {
  expect(css).toContain('@import "tailwindcss";');
  expect(css).toContain('@import "@dark-factory/tailwind-config";');
  expect(css).toContain('@source "./";');
});
