import type { Category, ClassificationType } from "@dark-factory/annotate";

/** The vocabulary in its own order. Client components cannot import the package at runtime (its entry pulls in the model SDK), so the list is repeated here. */
export const ORDER: ClassificationType[] = [
  "product",
  "business-goal",
  "feature",
  "functional-requirement",
  "mockup",
  "integration",
  "data-entity",
  "data-requirement",
  "ux-requirement",
  "non-functional-requirement",
  "operational-requirement",
  "assumption",
  "dependency",
  "user-class",
  "imposed-technology",
  "configurable-item",
  "out-of-scope",
  "standard",
  "glossary-term",
];

// Class names are spelled out so Tailwind can see them.
const FAMILIES = [
  {
    types: [
      "functional-requirement",
      "data-requirement",
      "ux-requirement",
      "non-functional-requirement",
      "operational-requirement",
    ],
    ink: "text-blue-800 dark:text-blue-400",
    swatch: "bg-electric-blue",
    accent: "accent-electric-blue",
    tint: ["bg-electric-blue/15", "bg-electric-blue/30"],
    line: "border-electric-blue",
    ring: "ring-electric-blue",
  },
  {
    types: [
      "data-entity",
      "integration",
      "feature",
      "user-class",
      "product",
      "mockup",
    ],
    ink: "text-moss-700 dark:text-moss-300",
    swatch: "bg-moss-500",
    accent: "accent-moss-500",
    tint: ["bg-moss-500/15", "bg-moss-500/30"],
    line: "border-moss-500",
    ring: "ring-moss-500",
  },
  {
    types: [
      "dependency",
      "assumption",
      "imposed-technology",
      "standard",
      "configurable-item",
    ],
    ink: "text-indigo-700 dark:text-indigo-400",
    swatch: "bg-indigo-500",
    accent: "accent-indigo-500",
    tint: ["bg-indigo-500/15", "bg-indigo-500/30"],
    line: "border-indigo-500",
    ring: "ring-indigo-500",
  },
  {
    types: ["business-goal", "out-of-scope", "glossary-term"],
    ink: "text-lime-700 dark:text-lime-400",
    swatch: "bg-lime-600",
    accent: "accent-lime-600",
    tint: ["bg-lime-600/20", "bg-lime-600/35"],
    line: "border-lime-600",
    ring: "ring-lime-600",
  },
] satisfies { types: ClassificationType[]; [k: string]: unknown }[];
export const familyOf = (t: string) =>
  FAMILIES.find((f) => (f.types as string[]).includes(t)) ?? FAMILIES[3]!;

export const CATEGORY: Record<Category, string> = {
  PER: "performance, capacity",
  REL: "reliability, availability",
  SEC: "security",
  PRV: "privacy",
  SCA: "scalability",
  MNT: "maintainability",
  CMP: "compatibility, portability",
};

/** Marks on a table hang off its cells: "tables/2/cells/5" belongs to "tables/2". */
export const owner = (elementId: string) =>
  elementId.replace(/\/cells\/\d+$/, "");
