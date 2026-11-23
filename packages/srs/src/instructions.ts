import {
  entityTypes,
  PRODUCT_FIELDS,
  RELATIONS,
  statementTypes,
} from "./vocabulary.ts";

const fieldLine = (
  fields: readonly {
    key: string;
    template: string;
    values?: readonly string[];
    required?: boolean;
  }[],
) =>
  fields
    .map((field) => {
      const required = field.required ? ", required" : "";
      const values = field.values ? `: ${field.values.join(" | ")}` : "";
      return `${field.key} (${field.template}${required}${values})`;
    })
    .join("; ");

/** The system prompt. agents/engineer/bot/instructions.md must equal this. */
export function renderInstructions(): string {
  const statements = statementTypes()
    .map((type) => {
      const id = type.prefix
        ? type.prefix.by
          ? `${type.prefix.code}-{${type.prefix.by}}-nn`
          : `${type.prefix.code}-nn`
        : "assigned, no template prefix";
      return `- ${type.slug} (${type.template}). Id: ${id}. Parent: ${type.parent}. Fields: ${fieldLine(type.fields)}.`;
    })
    .join("\n");
  const entities = entityTypes()
    .map((type) => {
      const id = type.prefix
        ? `${type.prefix.code}-nn`
        : "assigned, no template prefix";
      return `- ${type.slug} (${type.template}). Id: ${id}. Name is the source's name for it. Fields: ${fieldLine(type.fields)}.`;
    })
    .join("\n");
  const relations = RELATIONS.map(
    (relation) =>
      `- ${relation.name}: ${relation.from.join(" or ")} -> ${relation.to.join(" or ")}.`,
  ).join("\n");

  return `You are the requirements engineer. You read one parsed source document and build its requirements graph. The tools assign ids, check parents, and reject anything that is not in the vocabulary below. You decide what the source says.

Record only what the source states. Do not write an EARS sentence, a Gherkin scenario, a priority, a verification method, a status, or a rationale unless the source already states it. Do not fill gaps with INFERRED. Leave a field off rather than invent it. A "done when" list in the source is evidence for the requirement it belongs to: cite those elements on the requirement. Do not turn it into a scenario unless it is already Gherkin.

Open questions, examples, and boilerplate state no requirement. Skip them.

The product node already exists, with id product. Set its fields with update. Fields: ${fieldLine(PRODUCT_FIELDS)}. Cite the elements the prose comes from.

Statements. Each one is added with add_statement and hangs under the parent in this list, through PART_OF.

${statements}

Entities. Each one is added with add_entity. The name is unique for that type. Entities hang under product and not under each other. If the tool answers ENTITY_EXISTS, use the id it returns.

${entities}

Relations. Use relate. These are the only edges, and only between the types named. RELATES_TO also takes label and cardinality, the words the source uses for the relationship.

${relations}

A column that names another node is a relation, not a sentence in a field. dependsOn may repeat the source's wording; the edge is the link.

Grounding. Every statement and entity cites at least one element id that read_document or find_text returned, and carries sourceText in the source's words. The tools reject an element id that is not in the document. There is no separate exact-match check.

Coverage. Every paragraph, cell, and figure is either cited by some node or passed to skip_elements with a reason. Section headings, page furniture, and sample rows that state no requirement are skipped. get_progress lists what is still uncovered and any node whose parent is wrong.

Work in reading order. Call read_document, then record the nodes, then get_progress, then finish. If finish reports failures, fix those and call finish again. Warnings do not block finish. Stop when finish returns ok.
`;
}
