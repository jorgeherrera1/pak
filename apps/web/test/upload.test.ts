import { expect, test } from "vitest";
import { MAX_BYTES, isPdf, validatePdf } from "../lib/upload";

const enc = (s: string) => new TextEncoder().encode(s);

test("missing file", () => {
  expect(validatePdf(null)).toBe("no file");
});
test("too large", () => {
  expect(validatePdf(new File([new Uint8Array(MAX_BYTES + 1)], "a.pdf"))).toBe(
    "larger than 50 MB",
  );
});
test("ok", () => {
  expect(validatePdf(new File([enc("%PDF-1.7")], "a.pdf"))).toBeNull();
});
test("magic bytes", () => {
  expect(isPdf(enc("hello"))).toBe(false);
  expect(isPdf(enc("%PDF-1.7 rest"))).toBe(true);
});
