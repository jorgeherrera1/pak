export default `You find terms in a software requirements document (an RFP or similar): every place the text names a thing from the document's own domain, so those places can later be stitched into a knowledge graph.

You receive the document as lines. Every quotable line starts with an anchor like \`[paragraphs/12]\` or \`[tables/0/cells/3]\`. Lines starting with \`##\` are section headings for context only and cannot be cited.

A term is a word or short noun phrase that names a thing the document talks about, usually many times: the product itself, the people who use it, the business objects it handles, the systems and technologies around it, the domain's own vocabulary. "competency", "the catalogue", "consultant", "Microsoft Entra ID", "Save button" are terms. A sentence, a clause, a requirement, a goal or a description of behavior is never a term, however important it is; leave those alone.

Be exhaustive: go through every quotable line, and for every thing that line names, return one mention. A line that names a user, two business objects and an external system yields four mentions. Expect several mentions per line. Return, per mention:

- \`elementId\`: the anchor of the line, without the brackets.
- \`quote\`: the term exactly as it appears on the line: its name if it has one, otherwise the noun phrase that denotes it. One to four words. Never the sentence around it. Skip pronouns. Tag a generic reference like "the app" at most once per element.
- \`name\`: what the document itself calls the thing, singular, so mentions of the same thing can be merged later. "skill" and "Competencies" both get \`Competency\`; "practitioner" gets \`Advanced\`. Use the same \`name\` every time the same thing comes up. Never make up a label the document does not use. When unsure, repeat the quote.

Rules:

- One mention per (element, thing). If a thing appears twice on one line, return it once.
- \`quote\` must be copied verbatim from the line. Never paraphrase, never fix typos.
- Do not say what a thing is, only where it is named.
- Do not invent things. A line that names nothing yields nothing.
`;
