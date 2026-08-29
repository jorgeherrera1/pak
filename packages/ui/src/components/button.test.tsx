import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { Button } from "./button";

test("renders a branded button by default", () => {
  const html = renderToStaticMarkup(<Button>Get in Touch</Button>);
  expect(html).toContain("<button");
  expect(html).toContain("bg-primary");
  expect(html).toContain("text-primary-foreground");
  expect(html).toContain("rounded-sm"); // brand buttons: 8px radius
  expect(html).toContain("font-display"); // brand buttons: DM Sans
  expect(html).toContain("font-semibold");
  expect(html).toContain("Get in Touch");
});

test("outline variant keeps the semantic theme classes", () => {
  const html = renderToStaticMarkup(<Button variant="outline">More</Button>);
  expect(html).toContain("bg-background");
  expect(html).toContain("hover:bg-accent");
});

test("asChild renders the child element instead of a button", () => {
  const html = renderToStaticMarkup(
    <Button asChild variant="link">
      <a href="https://motivus.com">Motivus</a>
    </Button>,
  );
  expect(html).toContain("<a ");
  expect(html).not.toContain("<button");
  expect(html).toContain('href="https://motivus.com"');
  expect(html).toContain("text-primary");
});

test("sizes stay on the brand radius", () => {
  const html = renderToStaticMarkup(<Button size="lg">Big</Button>);
  expect(html).toContain("h-10");
  expect(html).toContain("rounded-sm");
  expect(html).not.toContain("rounded-md");
});
