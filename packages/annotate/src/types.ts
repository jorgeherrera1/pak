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

/**
 * The types that name a kind of thing the document refers to by name. The
 * other twelve name a kind of claim. A classification of one of these types
 * is a sentence about an entity, not the entity.
 */
export const ENTITY_KINDS = [
  "product",
  "user-class",
  "data-entity",
  "integration",
  "imposed-technology",
  "standard",
  "glossary-term",
] as const satisfies readonly ClassificationType[];
export type EntityKind = (typeof ENTITY_KINDS)[number];

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

export type AnnotateResult = {
  classifications: Classification[];
  warnings: string[];
};
