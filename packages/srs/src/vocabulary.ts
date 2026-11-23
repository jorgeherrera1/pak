/**
 * The SRS template, as data. Tools, instructions, the check and the graph
 * writer import this file. Nothing else restates the types.
 */

export type Side = "statement" | "entity";

export type FieldSpec = {
  /** Stored key. */
  key: string;
  /** Column or label in docs/srs-template.html. */
  template: string;
  values?: readonly string[];
  required?: boolean;
};

export type Prefix = {
  code: string;
  /** Minimum digits. FR is 3, everything else with a prefix is 2. */
  width: number;
  /** Field inserted into the id, as in NFR-{category}-nn. */
  by?: string;
};

export type NodeType = {
  slug: string;
  /** A substring of docs/srs-template.html. */
  template: string;
  label: string;
  side: Side;
  /** `product`, or the slug of the only allowed parent. */
  parent: string;
  prefix?: Prefix;
  fields: readonly FieldSpec[];
};

export type RelationSpec = {
  name: string;
  from: readonly string[];
  to: readonly string[];
};

const priority = {
  key: "priority",
  template: "Priority",
  values: ["Must", "Should", "Could", "Wont"],
} as const satisfies FieldSpec;
const status = {
  key: "status",
  template: "Status",
  values: [
    "Draft",
    "Review",
    "Approved",
    "Implemented",
    "Verified",
    "Withdrawn",
  ],
} as const satisfies FieldSpec;
const verification = {
  key: "verification",
  template: "Verification",
  values: ["TEST", "E2E", "MEASURE", "AUDIT"],
} as const satisfies FieldSpec;
const ears = {
  key: "ears",
  template: "EARS pattern",
  values: [
    "Ubiquitous",
    "Event-driven",
    "State-driven",
    "Unwanted behavior",
    "Optional feature",
  ],
} as const satisfies FieldSpec;
const source = {
  key: "source",
  template: "Source",
} as const satisfies FieldSpec;
const card = [priority, verification, status] as const;

export const NFR_CATEGORIES = [
  "PER",
  "REL",
  "SEC",
  "PRV",
  "SCA",
  "MNT",
  "CMP",
] as const;

export const OPS_AREAS = ["12.1", "12.2", "12.3", "12.4", "12.5"] as const;

export const PRODUCT_ID = "product";

export const PRODUCT_FIELDS = [
  { key: "name", template: "name" },
  { key: "description", template: "one-sentence description" },
  { key: "mission", template: "mission" },
  { key: "definition", template: "definition" },
  { key: "systemContext", template: "system context" },
] as const satisfies readonly FieldSpec[];

export const TYPES = [
  {
    slug: "in-scope",
    template: "In scope",
    label: "InScopeItem",
    side: "statement",
    parent: PRODUCT_ID,
    fields: [{ key: "item", template: "item" }, source],
  },
  {
    slug: "out-of-scope",
    template: "Out of scope",
    label: "OutOfScopeItem",
    side: "statement",
    parent: PRODUCT_ID,
    fields: [
      { key: "item", template: "Excluded / reduced item" },
      { key: "sourceClause", template: "Source clause" },
      { key: "reason", template: "Reason" },
    ],
  },
  {
    slug: "technology-stack",
    template: "Technology Stack",
    label: "TechnologyStackItem",
    side: "statement",
    parent: PRODUCT_ID,
    fields: [
      { key: "layer", template: "Layer" },
      { key: "element", template: "Imposed element" },
      { key: "version", template: "Version / edition" },
      source,
    ],
  },
  {
    slug: "configurable",
    template: "Configurable item",
    label: "ConfigurableItem",
    side: "statement",
    parent: PRODUCT_ID,
    fields: [
      { key: "item", template: "Configurable item" },
      { key: "axis", template: "Axis" },
      { key: "changedBy", template: "Changed by" },
      { key: "notes", template: "Notes / source" },
    ],
  },
  {
    slug: "feature",
    template: "Product feature",
    label: "ProductFeature",
    side: "statement",
    parent: PRODUCT_ID,
    prefix: { code: "FEAT", width: 2 },
    fields: [
      { key: "feature", template: "Feature" },
      { key: "whatItDoes", template: "What it does" },
      { key: "release", template: "Release" },
      source,
    ],
  },
  {
    slug: "mockup",
    template: "UI mockup exhibit",
    label: "UiMockupExhibit",
    side: "statement",
    parent: "feature",
    prefix: { code: "MCK", width: 2 },
    fields: [
      { key: "screenName", template: "screen name" },
      {
        key: "disposition",
        template: "disposition",
        values: ["Binding", "Illustrative"],
      },
      source,
    ],
  },
  {
    slug: "functional-requirement",
    template: "Functional requirement",
    label: "FunctionalRequirement",
    side: "statement",
    parent: "feature",
    prefix: { code: "FR", width: 3 },
    fields: [
      { key: "title", template: "title" },
      ...card,
      ears,
      { key: "requirement", template: "requirement" },
      { key: "rationale", template: "Rationale" },
      source,
      { key: "dependsOn", template: "Depends on" },
    ],
  },
  {
    slug: "scenario",
    template: "Acceptance criteria",
    label: "AcceptanceCriteriaScenario",
    side: "statement",
    parent: "functional-requirement",
    fields: [{ key: "gherkin", template: "Gherkin scenario" }],
  },
  {
    slug: "assumption",
    template: "Assumption",
    label: "Assumption",
    side: "statement",
    parent: PRODUCT_ID,
    prefix: { code: "ASM", width: 2 },
    fields: [
      { key: "assumption", template: "We assume that" },
      { key: "ifFalse", template: "If false" },
      source,
    ],
  },
  {
    slug: "dependency",
    template: "external dependency",
    label: "Dependency",
    side: "statement",
    parent: PRODUCT_ID,
    prefix: { code: "DEP", width: 2 },
    fields: [
      { key: "dependency", template: "Dependency" },
      { key: "provider", template: "Provider" },
      { key: "neededBy", template: "Needed by" },
    ],
  },
  {
    slug: "integration-contract",
    template: "Integration contract",
    label: "IntegrationContract",
    side: "statement",
    parent: PRODUCT_ID,
    prefix: { code: "IC", width: 2 },
    fields: [
      { key: "title", template: "title" },
      ...card,
      { key: "counterparty", template: "Counterparty" },
      { key: "direction", template: "Direction / pattern" },
      { key: "protocol", template: "Protocol / format" },
      { key: "auth", template: "Auth" },
      { key: "operations", template: "Key operations" },
      { key: "payload", template: "Payload shape" },
      { key: "classification", template: "Data classification" },
      { key: "failure", template: "Failure semantics" },
      { key: "limits", template: "Limits" },
      { key: "spec", template: "Spec" },
      { key: "environments", template: "Environments" },
      source,
    ],
  },
  {
    slug: "data-requirement",
    template: "data requirement",
    label: "DataRequirement",
    side: "statement",
    parent: PRODUCT_ID,
    prefix: { code: "DR", width: 2 },
    fields: [
      { key: "policy", template: "Policy" },
      {
        key: "sensitivity",
        template: "Sensitivity",
        values: ["Public", "Internal", "Confidential", "PII", "Regulated"],
      },
      source,
      {
        key: "verifyBy",
        template: "Verify by",
        values: ["TEST", "E2E", "MEASURE", "AUDIT"],
      },
    ],
  },
  {
    slug: "ux-constraint",
    template: "UX constraint",
    label: "UxConstraint",
    side: "statement",
    parent: PRODUCT_ID,
    fields: [
      { key: "aspect", template: "Aspect" },
      { key: "constraint", template: "Constraint" },
      source,
    ],
  },
  {
    slug: "usability",
    template: "Usability requirement",
    label: "UsabilityRequirement",
    side: "statement",
    parent: PRODUCT_ID,
    prefix: { code: "UX", width: 2 },
    fields: [
      { key: "title", template: "title" },
      ...card,
      { key: "requirement", template: "Requirement" },
      { key: "protocol", template: "Measurement protocol" },
      source,
    ],
  },
  {
    slug: "non-functional",
    template: "Non-functional requirement",
    label: "NonFunctionalRequirement",
    side: "statement",
    parent: PRODUCT_ID,
    prefix: { code: "NFR", width: 2, by: "category" },
    fields: [
      {
        key: "category",
        template: "category",
        values: NFR_CATEGORIES,
        required: true,
      },
      { key: "title", template: "title" },
      ...card,
      { key: "requirement", template: "Requirement" },
      { key: "measurement", template: "Measurement" },
      source,
    ],
  },
  {
    slug: "operational",
    template: "Operational requirement",
    label: "OperationalRequirement",
    side: "statement",
    parent: PRODUCT_ID,
    prefix: { code: "OPS", width: 2 },
    fields: [
      {
        key: "area",
        template: "area",
        values: OPS_AREAS,
        required: true,
      },
      { key: "title", template: "title" },
      ...card,
      ears,
      { key: "requirement", template: "requirement" },
      { key: "rationale", template: "Rationale" },
      source,
      { key: "dependsOn", template: "Depends on" },
    ],
  },
  {
    slug: "glossary",
    template: "Glossary",
    label: "GlossaryTerm",
    side: "entity",
    parent: PRODUCT_ID,
    fields: [{ key: "definition", template: "Definition" }],
  },
  {
    slug: "acronym",
    template: "Acronym",
    label: "Acronym",
    side: "entity",
    parent: PRODUCT_ID,
    fields: [{ key: "expansion", template: "Expansion" }],
  },
  {
    slug: "user-class",
    template: "User class",
    label: "UserClass",
    side: "entity",
    parent: PRODUCT_ID,
    fields: [
      {
        key: "characteristics",
        template: "Engineering-relevant characteristics",
      },
      { key: "volume", template: "Approx. volume" },
    ],
  },
  {
    slug: "system-integration",
    template: "System Integration",
    label: "SystemIntegration",
    side: "entity",
    parent: PRODUCT_ID,
    prefix: { code: "SI", width: 2 },
    fields: [
      {
        key: "boundary",
        template: "Int / Ext",
        values: ["Internal", "External"],
      },
      { key: "direction", template: "Direction" },
      { key: "protocol", template: "Protocol" },
      { key: "purpose", template: "Purpose" },
      { key: "criticality", template: "Criticality" },
    ],
  },
  {
    slug: "data-entity",
    template: "Data entity",
    label: "DataEntity",
    side: "entity",
    parent: PRODUCT_ID,
    prefix: { code: "ENT", width: 2 },
    fields: [
      { key: "definition", template: "Definition & identity" },
      { key: "attributes", template: "Key attributes" },
      { key: "invariants", template: "Invariants" },
    ],
  },
] as const satisfies readonly NodeType[];

type OfSide<S extends Side> = Extract<(typeof TYPES)[number], { side: S }>;

export type StatementSlug = OfSide<"statement">["slug"];

export type EntitySlug = OfSide<"entity">["slug"];

export const RELATIONS = [
  {
    name: "DEPENDS_ON",
    from: ["functional-requirement", "operational"],
    to: [
      "data-entity",
      "integration-contract",
      "functional-requirement",
      "configurable",
    ],
  },
  {
    name: "DERIVES",
    from: ["mockup"],
    to: ["functional-requirement", "usability", "data-entity"],
  },
  {
    name: "AFFECTS",
    from: ["assumption", "dependency"],
    to: ["functional-requirement"],
  },
  { name: "DRIVES", from: ["user-class"], to: ["functional-requirement"] },
  { name: "APPLIES_TO", from: ["data-requirement"], to: ["data-entity"] },
  {
    name: "CONTRACT",
    from: ["system-integration"],
    to: ["integration-contract"],
  },
  { name: "RELATES_TO", from: ["data-entity"], to: ["data-entity"] },
] as const satisfies readonly RelationSpec[];

export const typeBySlug = (slug: string): NodeType | undefined =>
  TYPES.find((type) => type.slug === slug);

export const relationByName = (name: string): RelationSpec | undefined =>
  RELATIONS.find((relation) => relation.name === name);

export const statementTypes = (): readonly NodeType[] =>
  TYPES.filter((type) => type.side === "statement");

export const entityTypes = (): readonly NodeType[] =>
  TYPES.filter((type) => type.side === "entity");

export const isStatementSlug = (slug: string): slug is StatementSlug =>
  statementTypes().some((type) => type.slug === slug);

export const isEntitySlug = (slug: string): slug is EntitySlug =>
  entityTypes().some((type) => type.slug === slug);

/** Prefix codes the tools allocate, including SI (used in §4.1, absent from §0.2). */
export const prefixCodes = (): string[] => [
  ...new Set(
    TYPES.flatMap((type) =>
      "prefix" in type && type.prefix ? [type.prefix.code] : [],
    ),
  ),
];

export const CONTENT_KINDS = ["paragraph", "cell", "figure"] as const;
