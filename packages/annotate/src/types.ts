/** Output shape of the annotate module. Vocabulary follows the IEEE 29148 SRS template. */

import type { Span } from "@dark-factory/parse";

export const TYPES = [
  "feature",
  "functional-requirement",
  "mockup",
  "integration",
  "data-entity",
  "data-requirement",
  "ux-requirement",
  "non-functional-requirement",
  "operational-requirement",
  "assumption",
  "dependency",
  "user-class",
  "imposed-technology",
  "configurable-item",
  "out-of-scope",
  "standard",
  "glossary-term",
] as const;
export type AnnotationType = (typeof TYPES)[number];

/** Non-functional requirement categories. */
export const CATEGORIES = [
  "PER",
  "REL",
  "SEC",
  "PRV",
  "SCA",
  "MNT",
  "CMP",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Annotation = {
  id: string;
  type: AnnotationType;
  /** Element the quote was found in. */
  elementId: string;
  /** Where `text` sits in ParsedDocument.content. */
  span: Span;
  /** Verbatim quote from the source. */
  text: string;
  category?: Category;
};

export type AnnotateResult = { annotations: Annotation[]; warnings: string[] };
