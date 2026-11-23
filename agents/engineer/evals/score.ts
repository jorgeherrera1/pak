export type ScoreNode = {
  id: string;
  type: string;
  elementIds: string[];
  parentId?: string;
};

export type ScoreRelation = {
  fromId: string;
  relation: string;
  toId: string;
};

export type ScoreGraph = {
  statements: ScoreNode[];
  entities: ScoreNode[];
  relations: ScoreRelation[];
};

export type Scores = {
  statementRecall: number;
  statementPrecision: number;
  structure: number;
  entityRecall: number;
  entityPrecision: number;
  relationRecall: number;
  relationPrecision: number;
};

const ratio = (hit: number, total: number) => (total === 0 ? 1 : hit / total);

const overlap = (left: string[], right: string[]) =>
  left.filter((id) => right.includes(id)).length;

/** Greedy match on type plus a shared cited element. Gold id -> actual id. */
export function matchNodes(gold: ScoreNode[], actual: ScoreNode[]) {
  const pairs = gold.flatMap((candidate) =>
    actual.flatMap((node) => {
      if (candidate.type !== node.type) return [];
      const shared = overlap(candidate.elementIds, node.elementIds);
      return shared > 0
        ? [{ gold: candidate.id, actual: node.id, shared }]
        : [];
    }),
  );
  pairs.sort((a, b) => b.shared - a.shared);
  const usedGold = new Set<string>();
  const usedActual = new Set<string>();
  const matched = new Map<string, string>();
  for (const pair of pairs) {
    if (usedGold.has(pair.gold) || usedActual.has(pair.actual)) continue;
    usedGold.add(pair.gold);
    usedActual.add(pair.actual);
    matched.set(pair.gold, pair.actual);
  }
  return matched;
}

const matchRelations = (
  gold: ScoreRelation[],
  actual: ScoreRelation[],
  nodes: Map<string, string>,
) => {
  const used = new Set<number>();
  let matched = 0;
  for (const edge of gold) {
    const from = nodes.get(edge.fromId);
    const to = nodes.get(edge.toId);
    if (!from || !to) continue;
    const index = actual.findIndex(
      (candidate, i) =>
        !used.has(i) &&
        candidate.relation === edge.relation &&
        candidate.fromId === from &&
        candidate.toId === to,
    );
    if (index < 0) continue;
    used.add(index);
    matched += 1;
  }
  return matched;
};

export function scoreGraphs(gold: ScoreGraph, actual: ScoreGraph): Scores {
  const statements = matchNodes(gold.statements, actual.statements);
  const entities = matchNodes(gold.entities, actual.entities);
  const nodes = new Map([...statements, ...entities]);
  let structured = 0;
  for (const candidate of gold.statements) {
    const actualId = statements.get(candidate.id);
    if (!actualId) continue;
    const node = actual.statements.find((row) => row.id === actualId);
    const expected =
      !candidate.parentId || candidate.parentId === "product"
        ? "product"
        : statements.get(candidate.parentId);
    if (node && expected && node.parentId === expected) structured += 1;
  }
  const relations = matchRelations(gold.relations, actual.relations, nodes);
  return {
    statementRecall: ratio(statements.size, gold.statements.length),
    statementPrecision: ratio(statements.size, actual.statements.length),
    structure: ratio(structured, statements.size),
    entityRecall: ratio(entities.size, gold.entities.length),
    entityPrecision: ratio(entities.size, actual.entities.length),
    relationRecall: ratio(relations, gold.relations.length),
    relationPrecision: ratio(relations, actual.relations.length),
  };
}
