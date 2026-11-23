import type { ParsedDocument } from "@dark-factory/parse";
import { contentIds, elementIds } from "./document.ts";
import {
  citedIds,
  type Entity,
  parentProblem,
  type SrsGraph,
  type Statement,
} from "./graph.ts";
import { graphSchema, readFields } from "./schema.ts";
import {
  type NodeType,
  PRODUCT_FIELDS,
  PRODUCT_ID,
  RELATIONS,
  relationByName,
  TYPES,
  typeBySlug,
} from "./vocabulary.ts";

export type Issue = { code: string; message: string };

export type CheckResult = { failures: Issue[]; warnings: Issue[] };

const fieldsIssue = (
  specs: Parameters<typeof readFields>[0],
  fields: Record<string, string>,
) => {
  const read = readFields(specs, fields, "create");
  return "error" in read ? read.error : undefined;
};

const idProblem = (
  type: NodeType,
  id: string,
  fields: Record<string, string>,
) => {
  const width = type.prefix?.width ?? 2;
  if (!type.prefix) {
    return new RegExp(`^${type.slug}-\\d{${width},}$`).test(id)
      ? undefined
      : `${id} must match ${type.slug}-nn`;
  }
  if (type.prefix.by) {
    const category = fields[type.prefix.by];
    const allowed = type.fields.find(
      (field) => field.key === type.prefix?.by,
    )?.values;
    if (!category || (allowed && !allowed.includes(category))) {
      return `${id} has no allowed ${type.prefix.by}`;
    }
    return new RegExp(`^${type.prefix.code}-${category}-\\d{${width},}$`).test(
      id,
    )
      ? undefined
      : `${id} must be ${type.prefix.code}-${category}-nn`;
  }
  return new RegExp(`^${type.prefix.code}-\\d{${width},}$`).test(id)
    ? undefined
    : `${id} must match ${type.prefix.code}-nn`;
};

const parentIssue = (graph: SrsGraph, type: NodeType, parentId: string) => {
  const problem = parentProblem(graph, type, parentId);
  if (!problem) return undefined;
  return problem.code === "PARENT_NOT_FOUND"
    ? `parent ${problem.detail} not found`
    : problem.detail;
};

const nodeIssues = (
  graph: SrsGraph,
  node: Statement | Entity,
  failures: Issue[],
) => {
  const type = typeBySlug(node.type);
  const side = "name" in node ? "entity" : "statement";
  if (type?.side !== side) {
    failures.push({
      code: "BAD_TYPE",
      message: `${node.id} type ${node.type}`,
    });
    return;
  }
  const id = idProblem(type, node.id, node.fields);
  if (id) failures.push({ code: "BAD_ID", message: id });
  const fields = fieldsIssue(type.fields, node.fields);
  if (fields)
    failures.push({ code: "BAD_ID", message: `${node.id} ${fields}` });
  const parent = parentIssue(graph, type, node.parentId);
  if (parent)
    failures.push({ code: "BAD_PARENT", message: `${node.id} ${parent}` });
};

export function orphans(graph: SrsGraph): { id: string; reason: string }[] {
  const rows: { id: string; reason: string }[] = [];
  for (const node of [...graph.statements, ...graph.entities]) {
    const type = typeBySlug(node.type);
    if (!type) {
      rows.push({ id: node.id, reason: `unknown type ${node.type}` });
      continue;
    }
    const parent = parentIssue(graph, type, node.parentId);
    if (parent) rows.push({ id: node.id, reason: parent });
  }
  return rows;
}

export function check(doc: ParsedDocument, graph: SrsGraph): CheckResult {
  const failures: Issue[] = [];
  const seen = new Map<string, string>();
  for (const type of TYPES) {
    const previous = seen.get(type.slug);
    if (previous && previous !== type.side) {
      failures.push({ code: "BOTH_SIDES", message: type.slug });
    }
    seen.set(type.slug, type.side);
  }

  const ids = new Set<string>([PRODUCT_ID]);
  for (const node of [...graph.statements, ...graph.entities]) {
    if (ids.has(node.id)) {
      failures.push({ code: "BAD_ID", message: `duplicate id ${node.id}` });
    }
    ids.add(node.id);
    nodeIssues(graph, node, failures);
  }
  const productFields = fieldsIssue(PRODUCT_FIELDS, graph.product.fields);
  if (productFields) {
    failures.push({ code: "BAD_ID", message: `product ${productFields}` });
  }

  const known = elementIds(doc);
  for (const elementId of citedIds(graph)) {
    if (!known.has(elementId)) {
      failures.push({ code: "UNKNOWN_ELEMENT", message: elementId });
    }
  }
  for (const row of graph.skipped) {
    if (!known.has(row.elementId)) {
      failures.push({ code: "UNKNOWN_ELEMENT", message: row.elementId });
    }
  }

  for (const edge of graph.relations) {
    const spec = relationByName(edge.relation);
    const from = endpoint(graph, edge.fromId);
    const to = endpoint(graph, edge.toId);
    if (!from || !to || !spec?.from.includes(from) || !spec?.to.includes(to)) {
      failures.push({
        code: "BAD_RELATION",
        message: `${edge.relation} ${edge.fromId} -> ${edge.toId} is not allowed; expected ${RELATIONS.map((r) => r.name).join(", ")}`,
      });
      continue;
    }
    if (edge.relation === "RELATES_TO" && (!edge.label || !edge.cardinality)) {
      failures.push({
        code: "BAD_RELATION",
        message: `${edge.fromId} RELATES_TO ${edge.toId} needs label and cardinality`,
      });
    }
  }

  const covered = new Set<string>([
    ...citedIds(graph),
    ...graph.skipped.map((row) => row.elementId),
  ]);
  for (const elementId of contentIds(doc)) {
    if (!covered.has(elementId)) {
      failures.push({ code: "UNCOVERED", message: elementId });
    }
  }

  return { failures, warnings: warnings(graph) };
}

const endpoint = (graph: SrsGraph, id: string) =>
  graph.statements.find((node) => node.id === id)?.type ??
  graph.entities.find((node) => node.id === id)?.type;

const textOf = (node: Statement) =>
  [node.sourceText, ...Object.values(node.fields)].join("\n");

function warnings(graph: SrsGraph): Issue[] {
  const issues: Issue[] = [];
  const systems = graph.entities.filter(
    (entity) => entity.type === "system-integration",
  );
  const contracts = graph.statements.filter(
    (statement) => statement.type === "integration-contract",
  );
  const links = graph.relations.filter((edge) => edge.relation === "CONTRACT");
  const paired =
    systems.length === contracts.length &&
    systems.every(
      (system) =>
        links.filter((edge) => edge.fromId === system.id).length === 1,
    ) &&
    contracts.every(
      (contract) =>
        links.filter((edge) => edge.toId === contract.id).length === 1,
    );
  if ((systems.length > 0 || contracts.length > 0) && !paired) {
    issues.push({
      code: "SI_IC",
      message: `${systems.length} system integrations and ${contracts.length} integration contracts are not 1:1`,
    });
  }

  const catalog = new Set(
    graph.entities
      .filter((entity) => entity.type === "data-entity")
      .flatMap((entity) => [entity.id, entity.name.toLowerCase()]),
  );
  const knownName = (token: string) =>
    catalog.has(token) ||
    catalog.has(token.toLowerCase()) ||
    graph.statements.some((node) => node.id === token) ||
    graph.entities.some(
      (entity) =>
        entity.id === token ||
        entity.name.toLowerCase() === token.toLowerCase(),
    ) ||
    graph.statements.some(
      (node) =>
        node.type === "configurable" &&
        node.fields.item?.toLowerCase() === token.toLowerCase(),
    );
  for (const node of graph.statements) {
    if (
      node.type !== "functional-requirement" &&
      node.type !== "operational" &&
      node.type !== "integration-contract"
    ) {
      continue;
    }
    for (const match of textOf(node).matchAll(/\bENT-\d+\b/g)) {
      if (!catalog.has(match[0])) {
        issues.push({
          code: "MISSING_ENTITY",
          message: `${node.id} names ${match[0]}, which is not in the entity catalog`,
        });
      }
    }
    const depends = node.fields.dependsOn;
    if (!depends || /^none$/i.test(depends.trim())) continue;
    for (const part of depends.split(/[,;·]|\band\b/)) {
      const token = part.trim();
      if (!token || /^none$/i.test(token)) continue;
      if (!knownName(token)) {
        issues.push({
          code: "MISSING_ENTITY",
          message: `${node.id} depends on "${token}", which is not in the catalog`,
        });
      }
    }
  }

  for (const user of graph.entities.filter(
    (entity) => entity.type === "user-class",
  )) {
    if (
      !graph.relations.some(
        (edge) => edge.relation === "DRIVES" && edge.fromId === user.id,
      )
    ) {
      issues.push({
        code: "USER_CLASS",
        message: `${user.id} ${user.name} drives no requirement`,
      });
    }
  }
  for (const mockup of graph.statements.filter(
    (statement) => statement.type === "mockup",
  )) {
    if (
      !graph.relations.some(
        (edge) => edge.relation === "DERIVES" && edge.fromId === mockup.id,
      )
    ) {
      issues.push({
        code: "MOCKUP",
        message: `${mockup.id} derives nothing`,
      });
    }
  }
  return issues;
}

export function verify(graph: unknown, doc: ParsedDocument): CheckResult {
  const parsed = graphSchema.safeParse(graph);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return { failures: [{ code: "SCHEMA", message }], warnings: [] };
  }
  return check(doc, parsed.data as SrsGraph);
}
