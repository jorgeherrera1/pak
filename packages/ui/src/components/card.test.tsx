import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card";

test("renders a branded card shell", () => {
  const html = renderToStaticMarkup(<Card>Body</Card>);
  expect(html).toContain('data-slot="card"');
  expect(html).toContain("bg-card");
  expect(html).toContain("rounded-lg"); // brand cards: 16px radius
  expect(html).toContain("shadow-card-soft"); // brand shadow token
  expect(html).not.toContain("rounded-xl");
});

test("composes header, title, description, and content", () => {
  const html = renderToStaticMarkup(
    <Card>
      <CardHeader>
        <CardTitle>Banking</CardTitle>
        <CardDescription>Intelligent execution.</CardDescription>
      </CardHeader>
      <CardContent>Details</CardContent>
    </Card>,
  );
  for (const slot of ["card-header", "card-title", "card-description", "card-content"]) {
    expect(html).toContain(`data-slot="${slot}"`);
  }
  expect(html).toContain("font-display"); // titles use DM Sans
  expect(html).toContain("text-muted-foreground");
});
