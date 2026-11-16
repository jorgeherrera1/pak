import { type Classification, chunk } from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import type { Entity } from "./types.ts";

/** What `runResolve` reads: the document as the anchored lines Annotate reads, in one piece. */
// ponytail: the whole document in one model call; a per-chunk candidate pass and one merge call when a real document outgrows the context window.
export const resolveInput = (doc: ParsedDocument): string =>
  chunk(doc).join("\n");

/** What `runLink` reads, one per chunk that holds a classification: the entity list, that chunk's classifications, and the chunk. */
export function linkInputs(
  doc: ParsedDocument,
  classifications: Classification[],
  entities: Entity[],
): { asked: Classification[]; text: string }[] {
  if (!entities.length) return [];
  const list = entities.map((e) => {
    // A name found across a line break keeps the break; the list is one entity per line.
    const names = new Set(
      [e.name, ...e.mentions.map((m) => m.text)].map((name) =>
        name.replace(/\s+/g, " "),
      ),
    );
    return `${e.id} | ${e.kind} | ${[...names].join("; ")}`;
  });
  return chunk(doc).flatMap((text) => {
    const asked = classifications.filter((c) =>
      text.includes(`[${c.elementId}] `),
    );
    if (!asked.length) return [];
    const lines = asked.map(
      (c) =>
        `${c.id} | ${c.type} | [${c.elementId}] | ${c.text.replace(/\s+/g, " ")}`,
    );
    return [
      {
        asked,
        text: `# Entities\n${list.join("\n")}\n\n# Classifications\n${lines.join("\n")}\n\n# Text\n${text}`,
      },
    ];
  });
}
