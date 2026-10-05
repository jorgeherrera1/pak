import { ENTITY_KINDS, find, fold } from "@dark-factory/annotate";
import type { Span } from "@dark-factory/parse";
import { z } from "zod";
import type { Entity, Mention, ResolveResult } from "./types.ts";

/** What the model returns for `resolve`. Names, never offsets. */
export const entitySchema = z.object({
  kind: z.enum(ENTITY_KINDS),
  name: z.string(),
  names: z.array(z.string()),
  possiblySameAs: z.array(z.string()),
});
export type EntityRow = z.infer<typeof entitySchema>;

/** Two names are the same name when they fold to the same text. */
const key = (name: string) => fold(name).folded.trim();
const quoted = (s: string) => JSON.stringify(s);
/** "e12" → 12, "a3" → 3: ids sort by their number. */
const num = (id: string) => Number(id.slice(1));

/**
 * Model rows in, grounded entities out. The model supplies names; code finds
 * every place each name occurs, and an entity exists only if one does. The
 * stored text is always the source's, never the model's. This is the step
 * boundary AI output must cross.
 */
export function groundEntities(
  rows: EntityRow[],
  anchors: Map<string, Span[]>,
  content: string,
): ResolveResult {
  const warnings: string[] = [];

  // A name belongs to the first row that lists it.
  const owner = new Map<string, { row: number; spelled: string }>();
  rows.forEach((row, i) => {
    for (const name of [row.name, ...row.names]) {
      const k = key(name);
      const first = owner.get(k)?.row;
      if (!k || first === i) continue;
      if (first === undefined) owner.set(k, { row: i, spelled: name });
      else
        warnings.push(
          `${quoted(name)}: already a name of ${quoted(rows[first]!.name)}, dropped from ${quoted(row.name)}`,
        );
    }
  });

  // Every occurrence of every name in every quotable element.
  type Hit = Mention & { row: number; name: string; size: number };
  const hits: Hit[] = [];
  for (const [elementId, spans] of anchors) {
    const size = spans.reduce((sum, s) => sum + s.length, 0);
    for (const s of spans) {
      const { folded, at } = fold(
        content.slice(s.offset, s.offset + s.length),
        s.offset,
      );
      for (const [name, { row }] of owner)
        for (
          let i = find(folded, name);
          i >= 0;
          i = find(folded, name, i + 1)
        ) {
          const offset = at[i]!;
          const length = at[i + name.length - 1]! + 1 - offset;
          const text = content.slice(offset, offset + length);
          hits.push({
            row,
            name,
            size,
            elementId,
            span: { offset, length },
            text,
          });
        }
    }
  }

  // Longest first, so "account holder" is never also a mention of "account";
  // then the smallest element, so text a figure shares with the paragraphs
  // inside it is mentioned once, on the paragraph.
  const taken = new Uint8Array(content.length);
  const kept = hits
    .toSorted(
      (a, b) =>
        b.span.length - a.span.length || a.size - b.size || a.row - b.row,
    )
    .filter(({ span }) => {
      const range = taken.subarray(span.offset, span.offset + span.length);
      if (range.some(Boolean)) return false;
      range.fill(1);
      return true;
    });

  const found = new Set(kept.map((h) => h.name));
  for (const [name, { row, spelled }] of owner)
    if (!found.has(name))
      warnings.push(
        `${quoted(spelled)}: no mention in the text, dropped from ${quoted(rows[row]!.name)}`,
      );

  const mentionsOf = Map.groupBy(kept, (h) => h.row);
  const idOf = new Map<number, string>();
  const entities: Entity[] = [];
  rows.forEach((row, i) => {
    const mine = (mentionsOf.get(i) ?? []).toSorted(
      (a, b) => a.span.offset - b.span.offset,
    );
    if (!mine.length) {
      warnings.push(
        `${quoted(row.name)}: no mention in the text, entity dropped`,
      );
      return;
    }
    // The model's choice when it survived, otherwise the name the text uses most.
    const byName = Map.groupBy(mine, (h) => h.name);
    const named =
      byName.get(key(row.name)) ??
      [...byName.values()].toSorted((a, b) => b.length - a.length)[0]!;
    const id = `e${entities.length + 1}`;
    idOf.set(i, id);
    entities.push({
      id,
      kind: row.kind,
      name: named[0]!.text,
      mentions: mine.map(({ elementId, span, text }) => ({
        elementId,
        span,
        text,
      })),
    });
  });

  const pairs = new Map<string, [string, string]>();
  rows.forEach((row, i) => {
    const a = idOf.get(i);
    if (!a) return;
    for (const other of row.possiblySameAs) {
      const b = idOf.get(owner.get(key(other))?.row ?? -1);
      if (!b || b === a) {
        warnings.push(
          `${quoted(row.name)}: possiblySameAs ${quoted(other)} is not another entity, dropped`,
        );
        continue;
      }
      const pair: [string, string] = num(a) < num(b) ? [a, b] : [b, a];
      pairs.set(pair.join("|"), pair);
    }
  });

  return {
    entities,
    possiblySameAs: [...pairs.values()].toSorted(
      (x, y) => num(x[0]) - num(y[0]) || num(x[1]) - num(y[1]),
    ),
    warnings,
  };
}
