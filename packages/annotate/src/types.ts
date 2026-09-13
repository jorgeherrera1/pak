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
export type AnnotationType = (typeof TYPES)[number];

/** The types that name a thing the document refers to, as opposed to a statement it makes. */
export const NOUN_TYPES = [
  "product",
  "feature",
  "integration",
  "data-entity",
  "user-class",
  "imposed-technology",
  "standard",
  "glossary-term",
] as const;
export type Kind = (typeof NOUN_TYPES)[number];

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

/**
 * A reference to a thing: what a span refers to. One per element a thing
 * appears in. `name` and `kind` are what the chunk that produced it called
 * the thing; hints for resolve to bucket on, not facts.
 */
export type Mention = {
  id: string;
  elementId: string;
  span: Span;
  /** Verbatim quote from the source, e.g. "skill". */
  text: string;
  /** The document's own label for the thing, singular, e.g. "Competency". */
  name: string;
  kind: Kind;
};

export type AnnotateResult = {
  annotations: Annotation[];
  mentions: Mention[];
  warnings: string[];
};
