"use client";

import type {
  AnnotateResult,
  Category,
  Classification,
  ClassificationType,
  Mention,
} from "@dark-factory/annotate";
import type { Cell, Element, ParsedDocument } from "@dark-factory/parse";
import { useMemo, useState, type ReactNode } from "react";
import { segments } from "@/lib/segments";

type Mark = Classification | Mention;
const isC = (m: Mark): m is Classification => "type" in m;
/** Layer key: a classification toggles by its type, a mention by the thing it names. */
const layer = (m: Mark) => (isC(m) ? `c:${m.type}` : `m:${m.name}`);

// Class names are spelled out so Tailwind can see them.
const FAMILIES = [
  {
    label: "Requirements",
    types: [
      "functional-requirement",
      "data-requirement",
      "ux-requirement",
      "non-functional-requirement",
      "operational-requirement",
    ],
    ink: "text-blue-800 dark:text-blue-400",
    swatch: "bg-electric-blue",
    tint: ["bg-electric-blue/15", "bg-electric-blue/30"],
    line: "border-electric-blue",
    ring: "ring-electric-blue",
  },
  {
    label: "Things",
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
    tint: ["bg-moss-500/15", "bg-moss-500/30"],
    line: "border-moss-500",
    ring: "ring-moss-500",
  },
  {
    label: "Constraints",
    types: [
      "dependency",
      "assumption",
      "imposed-technology",
      "standard",
      "configurable-item",
    ],
    ink: "text-indigo-700 dark:text-indigo-400",
    swatch: "bg-indigo-500",
    tint: ["bg-indigo-500/15", "bg-indigo-500/30"],
    line: "border-indigo-500",
    ring: "ring-indigo-500",
  },
  {
    label: "Context",
    types: ["business-goal", "out-of-scope", "glossary-term"],
    ink: "text-lime-700 dark:text-lime-400",
    swatch: "bg-lime-600",
    tint: ["bg-lime-600/20", "bg-lime-600/35"],
    line: "border-lime-600",
    ring: "ring-lime-600",
  },
] satisfies { types: ClassificationType[]; [k: string]: unknown }[];
const familyOf = (t: string) =>
  FAMILIES.find((f) => (f.types as string[]).includes(t)) ?? FAMILIES[3]!;

const MENTION_LINE = "border-bright-cyan";
const CATEGORY: Record<Category, string> = {
  PER: "performance, capacity",
  REL: "reliability, availability",
  SEC: "security",
  PRV: "privacy",
  SCA: "scalability",
  MNT: "maintainability",
  CMP: "compatibility, portability",
};

const anchor = (id: string) => id.replaceAll("/", "-");
/** Marks and warnings on a table hang off its cells: "tables/2/cells/5" belongs to "tables/2". */
const owner = (elementId: string) => elementId.replace(/\/cells\/\d+$/, "");
const EYEBROW =
  "font-display text-xs font-bold tracking-eyebrow text-muted-foreground uppercase";

type Ctx = {
  visible: (elementId: string) => Mark[];
  selected: string | null;
  select: (id: string) => void;
  /** 0 or 1 per classification id, so neighbours in one element get different tints. */
  parity: Map<string, number>;
};

export function AnnotateReader({
  doc,
  annotations,
  figureBase,
}: {
  doc: ParsedDocument;
  annotations: AnnotateResult;
  figureBase: string;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  const { byElement, counts, parity, dropped, names } = useMemo(() => {
    const all: Mark[] = [
      ...annotations.classifications,
      ...annotations.mentions,
    ];
    const byElement = new Map<string, Mark[]>();
    for (const m of all)
      byElement.set(m.elementId, [...(byElement.get(m.elementId) ?? []), m]);
    const counts = new Map<string, number>();
    for (const m of all) counts.set(layer(m), (counts.get(layer(m)) ?? 0) + 1);
    const parity = new Map<string, number>();
    const seen = new Map<string, number>();
    for (const c of annotations.classifications) {
      const n = seen.get(c.elementId) ?? 0;
      parity.set(c.id, n % 2);
      seen.set(c.elementId, n + 1);
    }
    // Warnings read "<elementId>: <what happened>".
    const dropped = new Map<string, string[]>();
    for (const w of annotations.warnings) {
      const [, id = "", what = w] = w.match(/^(\S+): (.*)$/s) ?? [];
      dropped.set(owner(id), [...(dropped.get(owner(id)) ?? []), what]);
    }
    // The things the document names, most mentioned first.
    const names = [...counts]
      .filter(([k]) => k.startsWith("m:"))
      .map(([k, n]) => [k.slice(2), n] as const)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { byElement, counts, parity, dropped, names };
  }, [annotations]);

  const ctx: Ctx = {
    visible: (id) =>
      (byElement.get(id) ?? []).filter((m) => !hidden.has(layer(m))),
    selected,
    select: (id) => setSelected((s) => (s === id ? null : id)),
    parity,
  };
  const toggle = (key: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const rows: ReactNode[] = [];
  let currentPage = 0;
  for (const e of doc.elements) {
    if (e.kind === "section") continue;
    const p = e.region[0]?.page;
    if (p !== undefined && p > currentPage) {
      currentPage = p;
      rows.push(
        <div
          key={`page-${p}`}
          className={`flex items-center gap-3 pt-4 ${EYEBROW}`}
        >
          Page {p}
          <span className="h-px flex-1 bg-border" />
        </div>,
      );
    }
    const ids = e.kind === "table" ? e.cells.map((c) => c.id) : [e.id];
    rows.push(
      <div
        key={e.id}
        id={anchor(e.id)}
        className="grid grid-cols-[minmax(0,1fr)_210px] gap-5"
      >
        <Body e={e} doc={doc} figureBase={figureBase} ctx={ctx} />
        <Margin
          e={e}
          marks={ids.flatMap(ctx.visible)}
          classified={ids.some((id) => byElement.get(id)?.some(isC))}
          dropped={dropped.get(e.id) ?? []}
          ctx={ctx}
        />
      </div>,
    );
  }

  return (
    <div className="flex flex-1">
      <nav className="sticky top-0 flex h-screen w-72 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-card p-4 text-sm">
        <span className={`px-3 pb-2 ${EYEBROW}`}>
          Classifications · highlight
        </span>
        {FAMILIES.map((f) => (
          <div key={f.label} className="flex flex-col gap-0.5 pb-2">
            <span className={`px-3 pt-2 text-xs font-bold ${f.ink}`}>
              {f.label}
            </span>
            {f.types.map((t) => (
              <Layer
                key={t}
                label={t}
                count={counts.get(`c:${t}`) ?? 0}
                on={!hidden.has(`c:${t}`)}
                onToggle={() => toggle(`c:${t}`)}
                swatch={`size-3.5 rounded-[3px] ${f.swatch}`}
              />
            ))}
          </div>
        ))}
        <span className={`mt-2 border-t px-3 pt-4 pb-2 ${EYEBROW}`}>
          Mentions · underline
        </span>
        {names.map(([name, count]) => (
          <Layer
            key={name}
            label={name}
            count={count}
            on={!hidden.has(`m:${name}`)}
            onToggle={() => toggle(`m:${name}`)}
            swatch="h-[3px] w-3.5 bg-bright-cyan"
          />
        ))}
      </nav>
      <div className="flex flex-1 justify-center bg-muted px-12 py-10">
        <article className="flex w-[920px] flex-col gap-5 self-start rounded-lg border bg-card px-12 py-11">
          {annotations.warnings.length > 0 && (
            <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-[13px] leading-normal">
              <span className="font-bold text-destructive">
                {annotations.warnings.length} annotations dropped at validation
              </span>
              <ul className="mt-1 list-disc pl-5">
                {annotations.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {rows}
        </article>
      </div>
    </div>
  );
}

function Layer({
  label,
  count,
  on,
  onToggle,
  swatch,
}: {
  label: string;
  count: number;
  on: boolean;
  onToggle: () => void;
  swatch: string;
}) {
  const live = on && count > 0;
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={count === 0}
      onClick={onToggle}
      className={`flex h-8 items-center gap-2.5 rounded-sm px-3 text-left enabled:hover:bg-secondary ${live ? "" : "text-muted-foreground"}`}
    >
      <span className="flex w-3.5 justify-center">
        <span
          className={
            live ? swatch : "size-3 rounded-[3px] border border-gray-400"
          }
        />
      </span>
      <span className={`flex-1 ${on ? "" : "line-through"}`}>{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </button>
  );
}

/** Text with classifications as tints and mentions as underlines. `skip` is drawn elsewhere. */
function Text({
  text,
  base,
  marks,
  skip,
  ctx,
}: {
  text: string;
  base?: number;
  marks: Mark[];
  skip?: Mark;
  ctx: Ctx;
}) {
  const drawn = marks.filter((m) => m !== skip);
  if (!drawn.length || base === undefined) return text;
  return segments(text, base, drawn).map((s, i) => {
    const cls = s.marks.find(isC);
    const men = s.marks.find((m): m is Mention => !isC(m));
    if (!cls && !men) return s.text;
    const on = cls?.id === ctx.selected;
    return (
      <span
        key={i}
        title={s.marks
          .map((m) => `${m.id} ${isC(m) ? m.type : m.name}`)
          .join("\n")}
        // The margin chip is the keyboard path to the same selection.
        onClick={cls && (() => ctx.select(cls.id))}
        className={[
          "box-decoration-clone py-[3px]",
          cls &&
            `cursor-pointer ${familyOf(cls.type).tint[on ? 1 : ctx.parity.get(cls.id)!]}`,
          on && `ring-2 ${familyOf(cls!.type).ring}`,
          men && `border-b-2 ${MENTION_LINE}`,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {s.text}
      </span>
    );
  });
}

function Body({
  e,
  doc,
  figureBase,
  ctx,
}: {
  e: Element;
  doc: ParsedDocument;
  figureBase: string;
  ctx: Ctx;
}) {
  const marks = ctx.visible(e.id);
  const span = e.span[0];
  switch (e.kind) {
    case "section":
      return null;
    case "paragraph": {
      const t = (skip?: Mark) => (
        <Text
          text={e.text}
          base={span?.offset}
          marks={marks}
          skip={skip}
          ctx={ctx}
        />
      );
      if (e.role === "title")
        return <h1 className="font-display text-h3">{t()}</h1>;
      if (e.role === "sectionHeading")
        return (
          <h2 className="pt-2 font-display text-eyebrow tracking-eyebrow uppercase">
            {t()}
          </h2>
        );
      if (e.role) return <p className="text-xs text-muted-foreground">{t()}</p>;
      // A classification that is the whole element becomes a side rule, so the mentions inside stay legible.
      const whole = marks
        .filter(isC)
        .find(
          (c) =>
            c.span.offset === span?.offset && c.span.length === span.length,
        );
      if (!whole) return <p className="leading-[1.65]">{t()}</p>;
      const on = whole.id === ctx.selected;
      const f = familyOf(whole.type);
      return (
        <p
          onClick={() => ctx.select(whole.id)}
          className={`cursor-pointer border-l-[3px] pl-3 leading-[1.65] ${f.line} ${on ? `${f.tint[0]} ring-2 ${f.ring}` : ""}`}
        >
          {t(whole)}
        </p>
      );
    }
    case "table":
      return <Table rows={e.rows} cols={e.cols} cells={e.cells} ctx={ctx} />;
    case "figure":
      return (
        <figure className="flex flex-col gap-2">
          {e.image && (
            // eslint-disable-next-line @next/next/no-img-element -- blob-served png, size unknown
            <img
              src={figureBase + e.image}
              alt={e.caption ?? e.id}
              className="max-w-full rounded-sm border"
            />
          )}
          {/* A figure has no text of its own; the words annotations point at exist only in content. */}
          {marks.length > 0 && span && (
            <p className="text-sm leading-[1.65] whitespace-pre-line text-muted-foreground">
              <Text
                text={doc.content.slice(span.offset, span.offset + span.length)}
                base={span.offset}
                marks={marks}
                ctx={ctx}
              />
            </p>
          )}
          {e.caption && (
            <figcaption className="text-sm text-muted-foreground">
              {e.caption}
            </figcaption>
          )}
        </figure>
      );
  }
}

function Table({
  rows,
  cols,
  cells,
  ctx,
}: {
  rows: number;
  cols: number;
  cells: Cell[];
  ctx: Ctx;
}) {
  const grid: (Cell | undefined)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }),
  );
  for (const c of cells) grid[c.row]![c.col] = c;
  return (
    <table className="w-full border-collapse self-start text-sm leading-[1.6]">
      <tbody>
        {grid.map((row, r) => (
          <tr key={r}>
            {row.map((c, i) => {
              if (!c) return null;
              const Tag = c.kind === "columnHeader" ? "th" : "td";
              return (
                <Tag
                  key={i}
                  rowSpan={c.rowSpan}
                  colSpan={c.colSpan}
                  className="border px-2 py-1.5 text-left align-top"
                >
                  <Text
                    text={c.text}
                    base={c.span[0]?.offset}
                    marks={ctx.visible(c.id)}
                    ctx={ctx}
                  />
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** What Annotate said about this element: one chip per classification, the names it mentions, what was dropped. */
function Margin({
  e,
  marks,
  classified,
  dropped,
  ctx,
}: {
  e: Element;
  marks: Mark[];
  classified: boolean;
  dropped: string[];
  ctx: Ctx;
}) {
  const mentions = marks.filter((m): m is Mention => !isC(m));
  const names = [...new Set(mentions.map((m) => m.name))];
  const isBody = e.kind !== "paragraph" || !e.role;
  return (
    <div className="flex flex-col items-start gap-1.5 text-xs text-muted-foreground">
      {marks.filter(isC).map((c) =>
        c.id === ctx.selected ? (
          <Inspector key={c.id} c={c} mentions={mentions} ctx={ctx} />
        ) : (
          <button
            key={c.id}
            type="button"
            onClick={() => ctx.select(c.id)}
            className={`flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-left font-bold ${familyOf(c.type).tint[0]} ${familyOf(c.type).ink}`}
          >
            <code className="font-normal">{c.id}</code>
            {c.type}
            {c.category && ` · ${c.category}`}
          </button>
        ),
      )}
      {isBody && !classified && (
        <span className="rounded-[6px] border border-dashed border-gray-400 px-2 py-1">
          not classified
        </span>
      )}
      {mentions.length > 0 && (
        <span>
          {mentions.length} {mentions.length === 1 ? "mention" : "mentions"} ·{" "}
          {names.join(", ")}
        </span>
      )}
      {dropped.map((w, i) => (
        <span key={i} className="text-destructive">
          dropped · {w}
        </span>
      ))}
      <code className="text-[11px]">
        {e.kind === "paragraph" && e.role ? `${e.id} · ${e.role}` : e.id}
      </code>
    </div>
  );
}

function Inspector({
  c,
  mentions,
  ctx,
}: {
  c: Classification;
  mentions: Mention[];
  ctx: Ctx;
}) {
  const f = familyOf(c.type);
  const end = c.span.offset + c.span.length;
  const inside = mentions.filter(
    (m) =>
      m.elementId === c.elementId &&
      m.span.offset >= c.span.offset &&
      m.span.offset + m.span.length <= end,
  );
  return (
    <button
      type="button"
      onClick={() => ctx.select(c.id)}
      className={`flex w-full flex-col gap-2 rounded-sm border-2 bg-card p-2.5 text-left shadow-card-soft ${f.line}`}
    >
      <span className={`flex items-center gap-1.5 font-bold ${f.ink}`}>
        <code className="font-normal">{c.id}</code>
        {c.type}
      </span>
      {c.category && (
        <span className="flex items-baseline gap-1.5">
          <span
            className={`rounded-[4px] px-1.5 py-px font-bold tracking-wider text-white ${f.swatch}`}
          >
            {c.category}
          </span>
          {CATEGORY[c.category]}
        </span>
      )}
      <span className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 text-[11px]">
        <span>element</span>
        <code className="text-foreground">{c.elementId}</code>
        <span>span</span>
        <code className="text-foreground">
          {c.span.offset} + {c.span.length}
        </code>
        <span>quote</span>
        <span className="font-bold text-success">found verbatim</span>
      </span>
      {inside.length > 0 && (
        <span>
          {inside.length} inside ·{" "}
          {[...new Set(inside.map((m) => m.name))].join(", ")}
        </span>
      )}
    </button>
  );
}
