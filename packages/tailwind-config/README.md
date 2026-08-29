# @dark-factory/tailwind-config

Shared Tailwind CSS v4 configuration and the **Motivus design tokens** — phase 1
of the design system (tokens only; components come later in `@dark-factory/ui`).

## Files

- `motivus.css` — the brand tokens as Tailwind `@theme` custom properties:
  colors (core brand + blue/indigo/moss/teal/lime/gray ramps + semantic roles +
  chart palettes), typography (DM Sans display / Lato body, full type scale,
  eyebrow/chip tracking), radii, shadows, and the 1120px content container.
  The palette is strict: Tailwind's default colors, radii, and shadows are
  reset, so only brand values generate utilities.
- `shared-styles.css` — the package entrypoint (`@import` Tailwind, then the
  tokens). Also carries scaffold-legacy tokens that keep the inherited
  Turborepo starter pages rendering unchanged; delete them with those pages.
- `tokens.test.ts` — merge gate (`npm run test`): pins canonical color values,
  rejects duplicate or dangling token definitions, and checks the type/shape
  invariants.

## Usage

```css
@import "tailwindcss";
@import "@dark-factory/tailwind-config";
```

Then use the generated utilities: `bg-electric-blue`, `text-fg-2`,
`bg-bg-dark`, `text-eyebrow tracking-eyebrow uppercase`, `rounded-lg`
(cards, 16px), `rounded-sm` (buttons, 8px), `shadow-card`, `font-display`,
`font-body`, `max-w-content`.

Note: the tokens reference DM Sans and Lato but do not load them; apps are
responsible for loading the fonts (e.g. via `next/font`).

## Provenance

Extracted from motivus.com (Elementor global styles + computed styles of live
elements, 2026-08-28) and cross-checked against the curated Motivus brand
tokens. The two sources agree on every core value except:

- the site's dark section background is `#0D1B3E`; the canonical deep navy is
  `#0A1628` — the canonical value is used here (`--color-deep-navy`);
- the site loads Oswald for one legacy eyebrow style; Oswald is not part of
  the system — eyebrows are DM Sans, uppercase, `0.14em` tracking.
