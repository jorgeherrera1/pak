import type { Span } from "@dark-factory/parse";

export type Segment<T> = { text: string; marks: T[] };

/**
 * SPIKE. Cuts `text` (which sits at `base` in ParsedDocument.content) at every mark boundary,
 * so overlapping marks become flat runs that each list the marks covering them.
 */
export function segments<T extends { span: Span }>(
  text: string,
  base: number,
  marks: T[],
): Segment<T>[] {
  const clamp = (n: number) => Math.min(Math.max(n - base, 0), text.length);
  const ranges = marks.map((m) => ({
    m,
    from: clamp(m.span.offset),
    to: clamp(m.span.offset + m.span.length),
  }));
  const cuts = [
    ...new Set([0, text.length, ...ranges.flatMap((r) => [r.from, r.to])]),
  ].sort((a, b) => a - b);
  return cuts.slice(1).map((to, i) => {
    const from = cuts[i]!;
    return {
      text: text.slice(from, to),
      marks: ranges.filter((r) => r.from <= from && r.to >= to).map((r) => r.m),
    };
  });
}
