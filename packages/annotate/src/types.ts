/** Output shape of the annotate module. Vocabulary follows the IEEE 29148 SRS template. */

import type { Span } from "@dark-factory/parse";

export const TYPES = [
  "product",
  "business-goal",
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
export type ClassificationType = (typeof TYPES)[number];

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

/** Evidence that the SRS needs something: what a span is. */
export type Classification = {
  id: string;
  type: ClassificationType;
  /** Element the quote was found in. */
  elementId: string;
  /** Where `text` sits in ParsedDocument.content. */
  span: Span;
  /** Verbatim quote from the source. */
  text: string;
  category?: Category;
};

/**
 * A term: a place the text names a thing in the document's domain. One per
 * element a thing appears in. A mention says which thing, never what the
 * thing is: that is decided once per thing in resolve, not once per occurrence.
 * `name` is what the chunk that produced it called the thing; a hint for
 * resolve to merge on, not a fact.
 */
export type Mention = {
  id: string;
  elementId: string;
  span: Span;
  /** Verbatim quote from the source, e.g. "skill". */
  text: string;
  /** The document's own label for the thing, singular, e.g. "Competency". */
  name: string;
};

export type AnnotateResult = {
  classifications: Classification[];
  mentions: Mention[];
  warnings: string[];
};
