import { expect, test } from "vitest";
import type { ParsedDocument } from "@dark-factory/parse";
import {
  addEntity,
  addStatement,
  check,
  cite,
  emptyGraph,
  GraphError,
  mergeEntities,
  relate,
  removeNode,
  skipElements,
  updateNode,
  type SrsGraph,
} from "../src/index.ts";

const doc: ParsedDocument = {
  source: { sha256: "s", pages: 1 },
  content: "hello world",
  warnings: [],
  elements: [
    {
      id: "paragraphs/0",
      parent: null,
      kind: "paragraph",
      text: "Consultants record a level.",
      region: [],
      span: [{ offset: 0, length: 5 }],
    },
    {
      id: "paragraphs/1",
      parent: null,
      kind: "paragraph",
      text: "Heading",
      role: "sectionHeading",
      region: [],
      span: [{ offset: 6, length: 5 }],
    },
    {
      id: "figures/0",
      parent: null,
      kind: "figure",
      region: [],
      span: [],
    },
    {
      id: "tables/0",
      parent: null,
      kind: "table",
      rows: 1,
      cols: 1,
      region: [],
      span: [],
      cells: [
        {
          id: "tables/0/cells/0",
          parent: "tables/0",
          kind: "content",
          text: "Learner",
          row: 0,
          col: 0,
          rowSpan: 1,
          colSpan: 1,
          region: [],
          span: [],
        },
      ],
    },
  ],
};

const known = new Set([
  "paragraphs/0",
  "paragraphs/1",
  "figures/0",
  "tables/0",
  "tables/0/cells/0",
]);

const quote = {
  elementIds: ["paragraphs/0"],
  sourceText: "Consultants record a level.",
};

const feature = (graph: SrsGraph) =>
  addStatement(graph, known, {
    type: "feature",
    parentId: "product",
    ...quote,
    fields: { feature: "Record a level" },
  });

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    if (err instanceof GraphError) return err;
    throw err;
  }
  throw new Error("did not throw");
};

test("ids follow the template and are not reused after remove", () => {
  const first = feature(emptyGraph("run"));
  const second = feature(first.graph);
  expect([first.id, second.id]).toEqual(["FEAT-01", "FEAT-02"]);
  const removed = removeNode(second.graph, first.id);
  expect(feature(removed).id).toBe("FEAT-03");
});

test("a functional requirement hangs under a feature, and a bad parent is refused", () => {
  const feat = feature(emptyGraph("run"));
  const fr = addStatement(feat.graph, known, {
    type: "functional-requirement",
    parentId: feat.id,
    ...quote,
    fields: { title: "Record one level" },
  });
  expect(fr.id).toBe("FR-001");
  const refused = code(() =>
    addStatement(feat.graph, known, {
      type: "functional-requirement",
      parentId: "product",
      ...quote,
    }),
  );
  expect(refused.code).toBe("PARENT_TYPE_NOT_ALLOWED");
  expect(refused.message).toContain("feature");
});

test("an unknown element is refused and a duplicate entity returns its id", () => {
  const missing = code(() =>
    addStatement(emptyGraph("run"), known, {
      type: "in-scope",
      parentId: "product",
      elementIds: ["nope"],
      sourceText: "x",
    }),
  );
  expect(missing.code).toBe("UNKNOWN_ELEMENT");
  const graph = emptyGraph("run");
  const created = addEntity(graph, known, {
    type: "user-class",
    name: "Consultant",
    ...quote,
  });
  const again = code(() =>
    addEntity(created.graph, known, {
      type: "user-class",
      name: "Consultant",
      ...quote,
    }),
  );
  expect(again.code).toBe("ENTITY_EXISTS");
  expect(again.message).toContain(created.id);
});

test("NFR ids encode the category, and relations follow the table", () => {
  const base = emptyGraph("run");
  const missing = code(() =>
    addStatement(base, known, {
      type: "non-functional",
      parentId: "product",
      ...quote,
    }),
  );
  expect(missing.code).toBe("INVALID_FIELDS");
  const nfr = addStatement(base, known, {
    type: "non-functional",
    parentId: "product",
    ...quote,
    fields: { category: "SCA" },
  });
  expect(nfr.id).toBe("NFR-SCA-01");
  const feat = feature(nfr.graph);
  const fr = addStatement(feat.graph, known, {
    type: "functional-requirement",
    parentId: feat.id,
    ...quote,
  });
  const entity = addEntity(fr.graph, known, {
    type: "data-entity",
    name: "Claim",
    ...quote,
  });
  expect(entity.id).toBe("ENT-01");
  const linked = relate(entity.graph, {
    fromId: fr.id,
    relation: "DEPENDS_ON",
    toId: entity.id,
  });
  const refused = code(() =>
    relate(linked, { fromId: fr.id, relation: "DEPENDS_ON", toId: feat.id }),
  );
  expect(refused.code).toBe("RELATION_NOT_ALLOWED");
  const bare = code(() =>
    relate(entity.graph, {
      fromId: entity.id,
      relation: "RELATES_TO",
      toId: entity.id,
    }),
  );
  expect(bare.code).toBe("RELATION_NOT_ALLOWED");
});

test("remove refuses a parent, and merge retargets the edge", () => {
  const feat = feature(emptyGraph("run"));
  const fr = addStatement(feat.graph, known, {
    type: "functional-requirement",
    parentId: feat.id,
    ...quote,
  });
  expect(code(() => removeNode(fr.graph, feat.id)).code).toBe("HAS_CHILDREN");
  const keep = addEntity(fr.graph, known, {
    type: "data-entity",
    name: "Claim",
    ...quote,
  });
  const drop = addEntity(keep.graph, known, {
    type: "data-entity",
    name: "Assessment",
    elementIds: ["paragraphs/1"],
    sourceText: "Heading",
  });
  const linked = relate(drop.graph, {
    fromId: fr.id,
    relation: "DEPENDS_ON",
    toId: drop.id,
  });
  const merged = mergeEntities(linked, { keepId: keep.id, mergeId: drop.id });
  expect(merged.entities.map((entity) => entity.id)).toEqual([keep.id]);
  expect(merged.relations[0]).toMatchObject({ toId: keep.id });
  expect(merged.entities[0]?.elementIds).toContain("paragraphs/1");
});

test("a covered document passes, and a cited element cannot be skipped", () => {
  const feat = feature(emptyGraph("run"));
  const skipped = skipElements(feat.graph, known, {
    elementIds: ["paragraphs/1", "figures/0", "tables/0/cells/0"],
    reason: "no requirement",
  });
  expect(check(doc, skipped).failures).toEqual([]);
  expect(code(() => skipElements(skipped, known, {
    elementIds: ["paragraphs/0"],
    reason: "no",
  })).code).toBe("ALREADY_CITED");
  const before = structuredClone(feat.graph);
  cite(feat.graph, known, {
    id: "product",
    elementIds: ["paragraphs/1"],
    sourceText: "Heading",
  });
  expect(feat.graph).toEqual(before);
});

test("product fields update, and the input graph is left unchanged", () => {
  const graph = emptyGraph("run");
  const before = structuredClone(graph);
  const next = updateNode(graph, {
    id: "product",
    fields: { name: "Competencies" },
  });
  expect(graph).toEqual(before);
  expect(next.product.fields.name).toBe("Competencies");
});
