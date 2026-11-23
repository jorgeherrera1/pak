import { z } from "zod";
import type { SrsGraph } from "./graph.ts";
import {
  entityTypes,
  type FieldSpec,
  PRODUCT_FIELDS,
  RELATIONS,
  statementTypes,
} from "./vocabulary.ts";

const text = z
  .string()
  .min(1)
  .refine((value) => value.trim() !== "", {
    message: "is empty",
  });

const choice = (values: readonly string[]) => {
  const [first, ...rest] = values;
  if (!first) throw new Error("empty field values");
  return z.enum([first, ...rest]);
};

/** One field object per node type. Create requires the vocabulary's required keys. */
export const fieldsSchema = (
  specs: readonly FieldSpec[],
  mode: "create" | "patch",
) => {
  const shape: Record<string, z.ZodType> = {};
  for (const spec of specs) {
    const value = spec.values?.length ? choice(spec.values) : text;
    shape[spec.key] =
      mode === "patch" || !spec.required ? value.optional() : value;
  }
  return z.strictObject(shape);
};

const kept = (value: Record<string, unknown>) => {
  const fields: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") fields[key] = item;
  }
  return fields;
};

/** The field rule for a tool call and for the check. */
export const readFields = (
  specs: readonly FieldSpec[],
  fields: unknown,
  mode: "create" | "patch",
): { fields: Record<string, string> } | { error: string } => {
  const parsed = fieldsSchema(specs, mode).safeParse(fields ?? {});
  if (!parsed.success) {
    return {
      error: parsed.error.issues
        .map((issue) => {
          const key = issue.path[0];
          return typeof key === "string"
            ? `${key}: ${issue.message}`
            : issue.message;
        })
        .join("; "),
    };
  }
  return { fields: kept(parsed.data) };
};

const names = <T extends string>(values: readonly T[]) => {
  const [first, ...rest] = values;
  if (!first) throw new Error("empty vocabulary");
  return z.enum([first, ...rest]);
};

const quote = {
  elementIds: z.array(z.string().min(1)).min(1),
  sourceText: z.string().min(1),
};

const atLeast = <T extends z.ZodType>(options: T[]) => {
  const [first, ...rest] = options;
  if (!first) throw new Error("empty vocabulary");
  return [first, ...rest] as [T, ...T[]];
};

export const statementInput = z.discriminatedUnion(
  "type",
  atLeast(
    statementTypes().map((type) =>
      z.object({
        type: z.literal(type.slug),
        parentId: z.string().min(1),
        ...quote,
        fields: fieldsSchema(type.fields, "create"),
      }),
    ),
  ),
);

export const entityInput = z.discriminatedUnion(
  "type",
  atLeast(
    entityTypes().map((type) =>
      z.object({
        type: z.literal(type.slug),
        name: z.string().min(1),
        ...quote,
        fields: fieldsSchema(type.fields, "create"),
      }),
    ),
  ),
);

const statementNode = z.discriminatedUnion(
  "type",
  atLeast(
    statementTypes().map((type) =>
      z.object({
        id: z.string().min(1),
        type: z.literal(type.slug),
        parentId: z.string().min(1),
        ...quote,
        fields: fieldsSchema(type.fields, "create"),
      }),
    ),
  ),
);

const entityNode = z.discriminatedUnion(
  "type",
  atLeast(
    entityTypes().map((type) =>
      z.object({
        id: z.string().min(1),
        type: z.literal(type.slug),
        name: z.string().min(1),
        parentId: z.string().min(1),
        ...quote,
        fields: fieldsSchema(type.fields, "create"),
      }),
    ),
  ),
);

const relationName = names(RELATIONS.map((relation) => relation.name));

export const graphSchema = z.object({
  runId: z.string().min(1),
  counters: z.record(z.string(), z.number().int().nonnegative()),
  product: z.object({
    elementIds: z.array(z.string()),
    sourceText: z.string(),
    fields: fieldsSchema(PRODUCT_FIELDS, "create"),
  }),
  statements: z.array(statementNode),
  entities: z.array(entityNode),
  relations: z.array(
    z.object({
      fromId: z.string().min(1),
      relation: relationName,
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

export const parseGraph = (data: unknown): SrsGraph =>
  graphSchema.parse(data) as SrsGraph;

export const citeInput = z.object({
  id: z.string(),
  ...quote,
});

export const relateInput = z.object({
  fromId: z.string(),
  relation: relationName,
  toId: z.string(),
  label: z.string().optional(),
  cardinality: z.string().optional(),
});

export const updateInput = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.string()),
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
  elementIds: quote.elementIds,
  reason: z.string().min(1),
});

export const readInput = z.object({
  fromElementId: z.string().optional(),
  limit: z.number().int().positive().max(40),
});

export const findInput = z.object({ text: z.string().min(1) });
