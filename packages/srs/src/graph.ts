import { GraphError } from "./errors.ts";
import {
  entityTypes,
  type FieldSpec,
  type NodeType,
  PRODUCT_FIELDS,
  PRODUCT_ID,
  relationByName,
  statementTypes,
  typeBySlug,
} from "./vocabulary.ts";

export type Statement = {
  id: string;
  type: string;
  parentId: string;
  elementIds: string[];
  sourceText: string;
  fields: Record<string, string>;
};

export type Entity = {
  id: string;
  type: string;
  name: string;
  parentId: string;
  elementIds: string[];
  sourceText: string;
  fields: Record<string, string>;
};

export type SrsRelation = {
  fromId: string;
  relation: string;
  toId: string;
  label?: string;
  cardinality?: string;
};

export type SrsGraph = {
  runId: string;
  counters: Record<string, number>;
  product: {
    elementIds: string[];
    sourceText: string;
    fields: Record<string, string>;
  };
  statements: Statement[];
  entities: Entity[];
  relations: SrsRelation[];
  skipped: { elementId: string; reason: string }[];
};

export function emptyGraph(runId: string): SrsGraph {
  return {
    runId,
    counters: {},
    product: { elementIds: [], sourceText: "", fields: {} },
    statements: [],
    entities: [],
    relations: [],
    skipped: [],
  };
}

export function citedIds(graph: SrsGraph): Set<string> {
  const ids = new Set<string>(graph.product.elementIds);
  for (const node of [...graph.statements, ...graph.entities]) {
    for (const id of node.elementIds) ids.add(id);
  }
  return ids;
}

const requireElements = (known: Set<string>, ids: string[]) => {
  const missing = [...new Set(ids)].filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new GraphError("UNKNOWN_ELEMENT", missing.join(", "));
  }
};

const unique = (ids: string[]) => [...new Set(ids)];

const checkFields = (
  specs: readonly FieldSpec[],
  fields: Record<string, string> | undefined,
  mode: "create" | "patch",
): Record<string, string> => {
  const input = fields ?? {};
  const byKey = new Map(specs.map((spec) => [spec.key, spec]));
  for (const [key, value] of Object.entries(input)) {
    const spec = byKey.get(key);
    if (!spec) {
      throw new GraphError(
        "INVALID_FIELDS",
        `unknown field ${key}; allowed: ${specs.map((s) => s.key).join(", ")}`,
      );
    }
    if (value.trim() === "") {
      throw new GraphError("INVALID_FIELDS", `${key} is empty`);
    }
    if (spec.values && !spec.values.includes(value)) {
      throw new GraphError(
        "INVALID_FIELDS",
        `${key} must be one of ${spec.values.join(", ")}`,
      );
    }
  }
  if (mode === "create") {
    for (const spec of specs) {
      if (spec.required && !input[spec.key]) {
        throw new GraphError(
          "INVALID_FIELDS",
          `${spec.key} is required${spec.values ? `: ${spec.values.join(", ")}` : ""}`,
        );
      }
    }
  }
  return input;
};

const requireParent = (graph: SrsGraph, type: NodeType, parentId: string) => {
  const allowed = type.parent === PRODUCT_ID ? "product" : `a ${type.parent}`;
  if (parentId === PRODUCT_ID) {
    if (type.parent !== PRODUCT_ID) {
      throw new GraphError(
        "PARENT_TYPE_NOT_ALLOWED",
        `${type.slug} parent must be ${allowed}`,
      );
    }
    return;
  }
  const parent = graph.statements.find((node) => node.id === parentId);
  if (!parent && !graph.entities.some((node) => node.id === parentId)) {
    throw new GraphError("PARENT_NOT_FOUND", parentId);
  }
  if (!parent || parent.type !== type.parent) {
    throw new GraphError(
      "PARENT_TYPE_NOT_ALLOWED",
      `${type.slug} parent must be ${allowed}`,
    );
  }
};

const counterKey = (type: NodeType, fields: Record<string, string>) => {
  if (!type.prefix) return type.slug;
  if (type.prefix.by) return `${type.prefix.code}-${fields[type.prefix.by]}`;
  return type.prefix.code;
};

const formatId = (
  type: NodeType,
  n: number,
  fields: Record<string, string>,
) => {
  const num = String(n).padStart(type.prefix?.width ?? 2, "0");
  if (!type.prefix) return `${type.slug}-${num}`;
  if (type.prefix.by) {
    return `${type.prefix.code}-${fields[type.prefix.by]}-${num}`;
  }
  return `${type.prefix.code}-${num}`;
};

const bump = (graph: SrsGraph, key: string) => {
  const n = (graph.counters[key] ?? 0) + 1;
  return {
    n,
    graph: { ...graph, counters: { ...graph.counters, [key]: n } },
  };
};

const unskip = (graph: SrsGraph, ids: string[]) => ({
  ...graph,
  skipped: graph.skipped.filter((row) => !ids.includes(row.elementId)),
});

export function addStatement(
  graph: SrsGraph,
  known: Set<string>,
  input: {
    type: string;
    parentId: string;
    elementIds: string[];
    sourceText: string;
    fields?: Record<string, string>;
  },
): { graph: SrsGraph; id: string } {
  const type = typeBySlug(input.type);
  if (type?.side !== "statement") {
    throw new GraphError(
      "UNKNOWN_TYPE",
      `${input.type} is not a statement type; expected ${statementTypes()
        .map((t) => t.slug)
        .join(", ")}`,
    );
  }
  requireParent(graph, type, input.parentId);
  const elementIds = unique(input.elementIds);
  requireElements(known, elementIds);
  const fields = checkFields(type.fields, input.fields, "create");
  const key = counterKey(type, fields);
  const allocated = bump(graph, key);
  const id = formatId(type, allocated.n, fields);
  const statement: Statement = {
    id,
    type: type.slug,
    parentId: input.parentId,
    elementIds,
    sourceText: input.sourceText,
    fields,
  };
  return {
    id,
    graph: unskip(
      {
        ...allocated.graph,
        statements: [...graph.statements, statement],
      },
      elementIds,
    ),
  };
}

export function addEntity(
  graph: SrsGraph,
  known: Set<string>,
  input: {
    type: string;
    name: string;
    elementIds: string[];
    sourceText: string;
    fields?: Record<string, string>;
  },
): { graph: SrsGraph; id: string } {
  const type = typeBySlug(input.type);
  if (type?.side !== "entity") {
    throw new GraphError(
      "UNKNOWN_TYPE",
      `${input.type} is not an entity type; expected ${entityTypes()
        .map((t) => t.slug)
        .join(", ")}`,
    );
  }
  const name = input.name.trim();
  if (!name) throw new GraphError("INVALID_FIELDS", "name is empty");
  const existing = graph.entities.find(
    (entity) => entity.type === type.slug && entity.name === name,
  );
  if (existing) throw new GraphError("ENTITY_EXISTS", existing.id);
  const elementIds = unique(input.elementIds);
  requireElements(known, elementIds);
  const fields = checkFields(type.fields, input.fields, "create");
  const key = counterKey(type, fields);
  const allocated = bump(graph, key);
  const id = formatId(type, allocated.n, fields);
  const entity: Entity = {
    id,
    type: type.slug,
    name,
    parentId: PRODUCT_ID,
    elementIds,
    sourceText: input.sourceText,
    fields,
  };
  return {
    id,
    graph: unskip(
      { ...allocated.graph, entities: [...graph.entities, entity] },
      elementIds,
    ),
  };
}

const findOwned = (graph: SrsGraph, id: string) => {
  if (id === PRODUCT_ID) return { kind: "product" as const };
  const statement = graph.statements.find((node) => node.id === id);
  if (statement) return { kind: "statement" as const, node: statement };
  const entity = graph.entities.find((node) => node.id === id);
  if (entity) return { kind: "entity" as const, node: entity };
  return undefined;
};

export function cite(
  graph: SrsGraph,
  known: Set<string>,
  input: { id: string; elementIds: string[]; sourceText: string },
): SrsGraph {
  const owned = findOwned(graph, input.id);
  if (!owned) throw new GraphError("NOT_FOUND", input.id);
  const elementIds = unique(input.elementIds);
  requireElements(known, elementIds);
  const next = unskip(graph, elementIds);
  if (owned.kind === "product") {
    return {
      ...next,
      product: {
        ...next.product,
        sourceText: input.sourceText,
        elementIds: unique([...next.product.elementIds, ...elementIds]),
      },
    };
  }
  const merge = <
    T extends { id: string; elementIds: string[]; sourceText: string },
  >(
    nodes: T[],
  ) =>
    nodes.map((node) =>
      node.id === input.id
        ? {
            ...node,
            sourceText: input.sourceText,
            elementIds: unique([...node.elementIds, ...elementIds]),
          }
        : node,
    );
  return owned.kind === "statement"
    ? { ...next, statements: merge(next.statements) }
    : { ...next, entities: merge(next.entities) };
}

const endpointType = (graph: SrsGraph, id: string) => {
  const statement = graph.statements.find((node) => node.id === id);
  if (statement) return statement.type;
  const entity = graph.entities.find((node) => node.id === id);
  if (entity) return entity.type;
  return undefined;
};

export function relate(
  graph: SrsGraph,
  input: {
    fromId: string;
    relation: string;
    toId: string;
    label?: string;
    cardinality?: string;
  },
): SrsGraph {
  const spec = relationByName(input.relation);
  if (!spec) {
    throw new GraphError(
      "RELATION_NOT_ALLOWED",
      `unknown relation ${input.relation}; expected ${RELATIONS_HELP()}`,
    );
  }
  if (input.fromId === input.toId) {
    throw new GraphError(
      "RELATION_NOT_ALLOWED",
      "a node cannot relate to itself",
    );
  }
  const from = endpointType(graph, input.fromId);
  const to = endpointType(graph, input.toId);
  if (!from) throw new GraphError("NOT_FOUND", input.fromId);
  if (!to) throw new GraphError("NOT_FOUND", input.toId);
  if (!spec.from.includes(from) || !spec.to.includes(to)) {
    throw new GraphError(
      "RELATION_NOT_ALLOWED",
      `${input.relation} allows ${spec.from.join(", ")} -> ${spec.to.join(", ")}`,
    );
  }
  if (input.relation === "RELATES_TO" && (!input.label || !input.cardinality)) {
    throw new GraphError(
      "RELATION_NOT_ALLOWED",
      "RELATES_TO requires label and cardinality",
    );
  }
  const props =
    input.relation === "RELATES_TO"
      ? { label: input.label, cardinality: input.cardinality }
      : {};
  const index = graph.relations.findIndex(
    (edge) =>
      edge.fromId === input.fromId &&
      edge.relation === input.relation &&
      edge.toId === input.toId,
  );
  if (index >= 0) {
    const relations = graph.relations.slice();
    relations[index] = {
      fromId: input.fromId,
      relation: input.relation,
      toId: input.toId,
      ...props,
    };
    return { ...graph, relations };
  }
  return {
    ...graph,
    relations: [
      ...graph.relations,
      {
        fromId: input.fromId,
        relation: input.relation,
        toId: input.toId,
        ...props,
      },
    ],
  };
}

const RELATIONS_HELP = () =>
  [
    "DEPENDS_ON",
    "DERIVES",
    "AFFECTS",
    "DRIVES",
    "APPLIES_TO",
    "CONTRACT",
    "RELATES_TO",
    "REFERS_TO",
    "COVERS",
  ].join(", ");

export function updateNode(
  graph: SrsGraph,
  input: { id: string; fields: Record<string, string> },
): SrsGraph {
  if (input.id === PRODUCT_ID) {
    const fields = {
      ...graph.product.fields,
      ...checkFields(PRODUCT_FIELDS, input.fields, "patch"),
    };
    return { ...graph, product: { ...graph.product, fields } };
  }
  const statement = graph.statements.find((node) => node.id === input.id);
  const entity = graph.entities.find((node) => node.id === input.id);
  const node = statement ?? entity;
  if (!node) throw new GraphError("NOT_FOUND", input.id);
  const type = typeBySlug(node.type);
  if (!type) throw new GraphError("UNKNOWN_TYPE", node.type);
  if (type.prefix?.by && input.fields[type.prefix.by]) {
    throw new GraphError(
      "INVALID_FIELDS",
      `${type.prefix.by} is fixed by ${node.id}`,
    );
  }
  const patch = checkFields(type.fields, input.fields, "patch");
  const fields = { ...node.fields, ...patch };
  checkFields(type.fields, fields, "create");
  if (statement) {
    return {
      ...graph,
      statements: graph.statements.map((row) =>
        row.id === input.id ? { ...row, fields } : row,
      ),
    };
  }
  return {
    ...graph,
    entities: graph.entities.map((row) =>
      row.id === input.id ? { ...row, fields } : row,
    ),
  };
}

export function moveNode(
  graph: SrsGraph,
  input: { id: string; parentId: string },
): SrsGraph {
  if (input.id === PRODUCT_ID) {
    throw new GraphError("PARENT_TYPE_NOT_ALLOWED", "product has no parent");
  }
  const statement = graph.statements.find((node) => node.id === input.id);
  const entity = graph.entities.find((node) => node.id === input.id);
  if (!statement && !entity) throw new GraphError("NOT_FOUND", input.id);
  const type = typeBySlug((statement ?? entity)!.type);
  if (!type) throw new GraphError("UNKNOWN_TYPE", (statement ?? entity)!.type);
  requireParent(graph, type, input.parentId);
  if (entity) return graph;
  return {
    ...graph,
    statements: graph.statements.map((row) =>
      row.id === input.id ? { ...row, parentId: input.parentId } : row,
    ),
  };
}

export function removeNode(graph: SrsGraph, id: string): SrsGraph {
  if (id === PRODUCT_ID) {
    throw new GraphError("HAS_CHILDREN", "product is the root");
  }
  if (!findOwned(graph, id)) throw new GraphError("NOT_FOUND", id);
  const children = graph.statements.filter((node) => node.parentId === id);
  if (children.length > 0) {
    throw new GraphError(
      "HAS_CHILDREN",
      children.map((child) => child.id).join(", "),
    );
  }
  return {
    ...graph,
    statements: graph.statements.filter((node) => node.id !== id),
    entities: graph.entities.filter((node) => node.id !== id),
    relations: graph.relations.filter(
      (edge) => edge.fromId !== id && edge.toId !== id,
    ),
  };
}

export function mergeEntities(
  graph: SrsGraph,
  input: { keepId: string; mergeId: string },
): SrsGraph {
  if (input.keepId === input.mergeId) return graph;
  const keep = graph.entities.find((node) => node.id === input.keepId);
  const merge = graph.entities.find((node) => node.id === input.mergeId);
  if (!keep) throw new GraphError("NOT_FOUND", input.keepId);
  if (!merge) throw new GraphError("NOT_FOUND", input.mergeId);
  if (keep.type !== merge.type)
    throw new GraphError("TYPE_MISMATCH", `${keep.type} vs ${merge.type}`);
  const fields = { ...merge.fields };
  for (const [key, value] of Object.entries(keep.fields)) fields[key] = value;
  const elementIds = unique([...keep.elementIds, ...merge.elementIds]);
  const entities = graph.entities
    .filter((node) => node.id !== input.mergeId)
    .map((node) =>
      node.id === input.keepId ? { ...node, fields, elementIds } : node,
    );
  const relations = graph.relations
    .map((edge) => ({
      ...edge,
      fromId: edge.fromId === input.mergeId ? input.keepId : edge.fromId,
      toId: edge.toId === input.mergeId ? input.keepId : edge.toId,
    }))
    .filter((edge) => edge.fromId !== edge.toId);
  const seen = new Set<string>();
  const deduped = relations.filter((edge) => {
    const key = `${edge.fromId}|${edge.relation}|${edge.toId}|${edge.label ?? ""}|${edge.cardinality ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...graph, entities, relations: deduped };
}

export function skipElements(
  graph: SrsGraph,
  known: Set<string>,
  input: { elementIds: string[]; reason: string },
): SrsGraph {
  const elementIds = unique(input.elementIds);
  requireElements(known, elementIds);
  const cited = citedIds(graph);
  const blocked = elementIds.filter((id) => cited.has(id));
  if (blocked.length > 0) {
    throw new GraphError("ALREADY_CITED", blocked.join(", "));
  }
  const skipped = graph.skipped.filter(
    (row) => !elementIds.includes(row.elementId),
  );
  for (const elementId of elementIds) {
    skipped.push({ elementId, reason: input.reason });
  }
  return { ...graph, skipped };
}
