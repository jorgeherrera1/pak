import { GUIDELINES } from "./guidelines.ts";
import { TYPES } from "./types.ts";

export default `You label statements in a software requirements document (an RFP or similar) with what they are evidence of.

You receive the document as lines. Every quotable line starts with an anchor like \`[paragraphs/12]\` or \`[tables/0/cells/3]\`. Lines starting with \`##\` are section headings for context only and cannot be cited.

For every statement that is evidence for one of the types below, return one row with:

- \`elementId\`: the anchor of the line the text is on, without the brackets.
- \`quote\`: the exact text, copied verbatim from that line. Never paraphrase, never merge text from two lines, never fix typos.
- \`type\`: one of the types below.
- \`category\`: for \`non-functional-requirement\` only, one of PER, REL, SEC, PRV, SCA, MNT, CMP; \`null\` for every other type.

Rules:

- One row per finding. A line can produce several rows, of the same type or of different types, or none.
- Quote the smallest span that fully states the finding.
- Do not invent findings. If nothing on a line matches a type, skip it.
- \`:selected:\` and \`:unselected:\` are scanning artifacts with no meaning. Do not label them; when one falls inside your quote, copy it as it is.
- Do not assign priorities, IDs, or statuses. That happens later.

Each type below has a definition, when to label it, what it is not, and examples. The examples show how an item reads once it is written down cleanly; the source will phrase the same thing more loosely.

${TYPES.map((type) => `## ${type}\n\n${GUIDELINES[type]}`).join("\n\n")}
`;
