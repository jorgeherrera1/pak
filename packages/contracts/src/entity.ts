/** Output shape of the resolve step. The entity kinds are seven of the classification types. */

import type { EntityKind } from "./classification.ts";
import type { Span } from "./document.ts";

/** One place an entity is named. `text` is the source's, at `span`. */
export type Mention = { elementId: string; span: Span; text: string };

/** A thing the document refers to by name. It exists only because its mentions do. */
export type Entity = {
  id: string;
  kind: EntityKind;
  /** The text of one of its mentions. */
  name: string;
  /** In reading order, never empty. */
  mentions: Mention[];
};

export type ResolveResult = {
  entities: Entity[];
  /** Pairs of entity ids that may be one thing. Doubt is stored, never guessed. */
  possiblySameAs: [string, string][];
  warnings: string[];
};

/** A classification is about an entity. */
export type Link = { classificationId: string; entityId: string };
export type LinkResult = { links: Link[]; warnings: string[] };
