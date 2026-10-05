import { ENTITY_KINDS, GUIDELINES } from "@dark-factory/annotate";

/** Instructions for `resolve`: the whole document in, one row per entity out. */
export const resolvePrompt = `You list the entities in a software requirements document (an RFP or similar): the things the document refers to by name, so that everything it says about one thing can later be found together.

You receive the whole document as lines. Lines starting with \`##\` are section headings. Every other line starts with an anchor like \`[paragraphs/12]\` or \`[tables/0/cells/3]\`; the anchors are not part of the text.

An entity is a thing the document refers to by name and that is one of the kinds below. A sentence, a requirement, a goal or a description of behavior is never an entity, however important it is.

Return one row per entity with:

- \`kind\`: one of the kinds below.
- \`names\`: every name the document uses for this entity, each copied verbatim from the text: every spelling, and the singular and the plural when both occur. One to four words each, never a sentence.
- \`name\`: the one of those names the document uses most.
- \`possiblySameAs\`: the \`name\` of every other entity in your answer that may be this same thing; empty when there is none.

Rules:

- Report each thing once. Put two names under one entity only when the document makes clear they mean the same thing: it defines one as the other, or uses them interchangeably for the same thing.
- When you are unsure whether two names mean the same thing, report two entities and name each in the other's \`possiblySameAs\`. Never guess a merge.
- A name belongs to one entity. Never list the same name under two entities.
- Sample values that only illustrate a thing, and text a screen displays, are not entities.
- Skip pronouns and generic words that name nothing in particular.
- Do not invent names. A name that is not in the text is discarded.

The guidelines below were written for labeling sentences. Here, use each one's definition, its "Not this" and its examples to decide the kind of a thing.

${ENTITY_KINDS.map((kind) => `## ${kind}\n\n${GUIDELINES[kind]}`).join("\n\n")}
`;

/** Instructions for `link`: one chunk, its classifications and the entity list in, one row per classification out. */
export const linkPrompt = `You connect labeled statements from a software requirements document (an RFP or similar) to the entities they are about.

You receive three parts:

- \`# Entities\`: one line per entity, as \`id | kind | names\`. These are the only entities there are.
- \`# Classifications\`: one line per labeled statement, as \`id | type | [anchor] | text\`.
- \`# Text\`: the part of the document the statements come from. Lines starting with \`##\` are section headings; every other line starts with its anchor.

Return one row per classification with:

- \`classificationId\`: its id, copied from the list.
- \`entityIds\`: the ids of the entities the statement is about; empty when it is about none of them.

A statement is about an entity when:

- it names the entity, by any of its names;
- it refers to the entity with a pronoun or a phrase such as "it", "they" or "that record", and the text makes clear which entity is meant;
- it sits under a heading, or in a table row or a list, that names the entity it describes.

Rules:

- Use only ids from the two lists. Never invent an id.
- Return every classification exactly once.
- Link what the statement is about, not everything nearby: an entity named only on a neighboring line does not count.
- When you are unsure whether a statement is about an entity, leave that entity out.
`;
