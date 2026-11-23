import { z } from "zod";
import type { SrsGraph } from "./graph.ts";

const fields = z.record(z.string(), z.string());

export const graphSchema = z.object({
  runId: z.string().min(1),
  counters: z.record(z.string(), z.number().int().nonnegative()),
  product: z.object({
    elementIds: z.array(z.string()),
    sourceText: z.string(),
    fields,
  }),
  statements: z.array(
    z.object({
      id: z.string().min(1),
      type: z.string().min(1),
      parentId: z.string().min(1),
      elementIds: z.array(z.string()).min(1),
      sourceText: z.string().min(1),
      fields,
    }),
  ),
  entities: z.array(
    z.object({
      id: z.string().min(1),
      type: z.string().min(1),
      name: z.string().min(1),
      parentId: z.string().min(1),
      elementIds: z.array(z.string()).min(1),
      sourceText: z.string().min(1),
      fields,
    }),
  ),
  relations: z.array(
    z.object({
      fromId: z.string().min(1),
      relation: z.string().min(1),
      toId: z.string().min(1),
      label: z.string().min(1).optional(),
      cardinality: z.string().min(1).optional(),
    }),
  ),
  skipped: z.array(
    z.object({
      elementId: z.string().min(1),
      reason: z.string().min(1),
    }),
  ),
});

export const parseGraph = (data: unknown): SrsGraph => graphSchema.parse(data);

const elementIds = z.array(z.string()).min(1);
const sourceText = z.string().min(1);

export const statementInput = z.object({
  type: z.string(),
  parentId: z.string(),
  elementIds,
  sourceText,
  fields: fields.optional(),
});

export const entityInput = z.object({
  type: z.string(),
  name: z.string(),
  elementIds,
  sourceText,
  fields: fields.optional(),
});

export const citeInput = z.object({
  id: z.string(),
  elementIds,
  sourceText,
});

export const relateInput = z.object({
  fromId: z.string(),
  relation: z.string(),
  toId: z.string(),
  label: z.string().optional(),
  cardinality: z.string().optional(),
});

export const updateInput = z.object({
  id: z.string(),
  fields,
});

export const moveInput = z.object({
  id: z.string(),
  parentId: z.string(),
});

export const removeInput = z.object({ id: z.string() });

export const mergeInput = z.object({
  keepId: z.string(),
  mergeId: z.string(),
});

export const skipInput = z.object({
  elementIds,
  reason: z.string().min(1),
});

export const readInput = z.object({
  fromElementId: z.string().optional(),
  limit: z.number().int().positive().max(40),
});

export const findInput = z.object({ text: z.string().min(1) });
