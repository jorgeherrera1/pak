import { fold } from "@dark-factory/annotate";

/** An entity as the answer key writes it, and as a run is reduced to for scoring. */
export type Named = { kind: string; names: string[] };

const key = (name: string) => fold(name).folded.trim();
const ratio = (a: number, b: number) => a / (b || 1);
/** name → index of the entity that has it. */
const index = (entities: Named[]) =>
  new Map(
    entities.flatMap((e, i) => e.names.map((name) => [key(name), i] as const)),
  );

/**
 * Three scores over names. `found`: did the run report the key's names.
 * `grouped`: B-cubed over the names both sides have, i.e. for each name, how
 * much of its entity on one side is its entity on the other. `kinds`: the
 * share of those names whose entity has the key's kind.
 */
export function scoreEntities(got: Named[], want: Named[]) {
  const g = index(got);
  const w = index(want);
  const shared = [...g.keys()].filter((name) => w.has(name));
  const group = (side: Map<string, number>, name: string) =>
    shared.filter((other) => side.get(other) === side.get(name));
  let precision = 0;
  let recall = 0;
  let kinds = 0;
  for (const name of shared) {
    const mine = group(g, name);
    const theirs = group(w, name);
    const both = mine.filter((other) => theirs.includes(other)).length;
    precision += both / mine.length;
    recall += both / theirs.length;
    if (got[g.get(name)!]!.kind === want[w.get(name)!]!.kind) kinds++;
  }
  return {
    found: {
      precision: ratio(shared.length, g.size),
      recall: ratio(shared.length, w.size),
    },
    grouped: {
      precision: ratio(precision, shared.length),
      recall: ratio(recall, shared.length),
    },
    kinds: ratio(kinds, shared.length),
  };
}

/** A link as the answer key writes it: the classification by element and type, the entity by any one of its names. */
export type WantLink = { elementId: string; type: string; entity: string };
/** A run's link: the same, with every name the run's entity has. */
export type GotLink = { elementId: string; type: string; names: string[] };

/** Precision and recall of (element, type, entity) triples. A run's entity is the key entity it shares a name with. */
export function scoreLinks(
  got: GotLink[],
  want: WantLink[],
  keyEntities: Named[],
) {
  const w = index(keyEntities);
  const entity = (names: string[]) => {
    for (const name of names) {
      const i = w.get(key(name));
      if (i !== undefined) return String(i);
    }
    // Not in the key: it can only be a false positive.
    return `?${key(names[0] ?? "")}`;
  };
  const g = new Set(
    got.map((l) => `${l.elementId}|${l.type}|${entity(l.names)}`),
  );
  const k = new Set(
    want.map((l) => `${l.elementId}|${l.type}|${entity([l.entity])}`),
  );
  const tp = [...g].filter((triple) => k.has(triple)).length;
  return {
    tp,
    fp: g.size - tp,
    fn: k.size - tp,
    precision: ratio(tp, g.size),
    recall: ratio(tp, k.size),
  };
}
