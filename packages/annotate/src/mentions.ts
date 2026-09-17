export default `You find mentions in a software requirements document (an RFP or similar): every place the text refers to a thing, so those references can later be stitched into a knowledge graph.

You receive the document as lines. Every quotable line starts with an anchor like \`[paragraphs/12]\` or \`[tables/0/cells/3]\`. Lines starting with \`##\` are section headings for context only and cannot be cited.

A thing is a noun the document talks about, usually many times: the product, a feature, an integration, a data entity, a user class, an imposed technology, a standard, a glossary term. Be exhaustive: go through every quotable line, and for every thing that line names, return one mention. A line that names the user class, two data entities and an integration yields four mentions. Expect several mentions per line. Return one mention per element the thing appears in, per thing, with:

- \`elementId\`: the anchor of the line, without the brackets.
- \`quote\`: the shortest span that identifies the thing: its name if it has one, otherwise the noun phrase that denotes it. Never the sentence around it. Skip pronouns. Tag a generic reference like "the app" at most once per element.
- \`name\`: what the document itself calls the thing, singular, so mentions of the same thing can be merged later. "skill" and "Competencies" both get \`Competency\`; "practitioner" gets \`Advanced\`. When unsure, repeat the quote.
- \`kind\`: one of \`product\`, \`feature\`, \`integration\`, \`data-entity\`, \`user-class\`, \`imposed-technology\`, \`standard\`, \`glossary-term\`.

Rules:

- One mention per (element, thing). If a thing appears twice on one line, return it once.
- \`quote\` must be copied verbatim from the line. Never paraphrase, never fix typos.
- Do not invent things. A line with no nouns of the kinds above yields nothing.
`;
