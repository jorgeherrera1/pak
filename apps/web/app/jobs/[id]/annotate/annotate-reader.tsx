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
import { context, segments } from "@/lib/segments";

type Mark = Classification | Mention;
const isC = (m: Mark): m is Classification => "type" in m;
/** Layer key: a classification toggles by its type, a mention by the thing it names. */
// ponytail: "Save Button" and "Save button" share a layer by lowercasing; real merging is resolve's job.
const layer = (m: Mark) =>
  isC(m) ? `c:${m.type}` : `m:${m.name.toLowerCase()}`;

/** The vocabulary in its own order. The package exports the types only, so the list is repeated here. */
const ORDER: ClassificationType[] = [
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
    accent: "accent-electric-blue",
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
    accent: "accent-moss-500",
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
    accent: "accent-indigo-500",
    tint: ["bg-indigo-500/15", "bg-indigo-500/30"],
    line: "border-indigo-500",
    ring: "ring-indigo-500",
  },
  {
    label: "Context",
    types: ["business-goal", "out-of-scope", "glossary-term"],
    ink: "text-lime-700 dark:text-lime-400",
    swatch: "bg-lime-600",
    accent: "accent-lime-600",
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
  const [tab, setTab] = useState<"c" | "m">("c");
  /** Layers whose occurrences are folded away; everything starts open. */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  /** What is switched off: layer keys ("m:catalogue") and single mark ids ("a5"). */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  const { byElement, byLayer, byId, parity, dropped, names, where } =
    useMemo(() => {
      const all: Mark[] = [
        ...annotations.classifications,
        ...annotations.mentions,
      ];
      const byId = new Map(all.map((m) => [m.id, m]));
      const byElement = new Map<string, Mark[]>();
      for (const m of all)
        byElement.set(m.elementId, [...(byElement.get(m.elementId) ?? []), m]);
      // Every instance of a layer, in reading order: what the index steps through.
      const byLayer = new Map<string, Mark[]>();
      for (const m of all)
        byLayer.set(layer(m), [...(byLayer.get(layer(m)) ?? []), m]);
      for (const ms of byLayer.values())
        ms.sort((a, b) => a.span.offset - b.span.offset);
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
      // The things the document names, most mentioned first, labelled as first written.
      const labels = new Map<string, string>();
      for (const m of annotations.mentions)
        if (!labels.has(layer(m))) labels.set(layer(m), m.name);
      const names = [...labels]
        .map(([key, label]) => ({
          key,
          label,
          count: byLayer.get(key)!.length,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      const els = new Map(doc.elements.map((e) => [e.id, e]));
      /** "p5 · What we store" */
      const where = (elementId: string) => {
        const e = els.get(owner(elementId));
        let s = e;
        while (s && !(s.kind === "section" && s.heading))
          s = s.parent ? els.get(s.parent) : undefined;
        return [
          e?.region[0] && `p${e.region[0].page}`,
          s?.kind === "section" && s.heading,
        ]
          .filter(Boolean)
          .join(" · ");
      };
      return { byElement, byLayer, byId, parity, dropped, names, where };
    }, [annotations, doc]);

  const ctx: Ctx = {
    visible: (id) =>
      (byElement.get(id) ?? []).filter(
        (m) => !hidden.has(layer(m)) && !hidden.has(m.id),
      ),
    selected,
    select: (id) => {
      setSelected((s) => (s === id ? null : id));
      reveal(id);
    },
    parity,
  };
  const flip = (key: string) => (set: ReadonlySet<string>) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    return next;
  };
  /** Something picked in the document shows up in the pane: right tab, group open, row in view. */
  const reveal = (id: string) => {
    const m = byId.get(id);
    if (!m) return;
    setTab(isC(m) ? "c" : "m");
    setCollapsed((c) => new Set([...c].filter((k) => k !== layer(m))));
    // The row only exists once the tab and the group have opened.
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-row="${id}"]`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  };
  const go = (m: Mark) => {
    setSelected(m.id);
    document
      .querySelector(`[data-marks~="${m.id}"]`)
      ?.scrollIntoView({ block: "center" });
  };

  // What is listed: the labels that have occurrences.
  const layers = (
    tab === "c"
      ? ORDER.map((t) => ({
          key: `c:${t}`,
          label: t as string,
          accent: familyOf(t).accent,
        }))
      : names.map((n) => ({ ...n, accent: "accent-bright-cyan" }))
  ).filter((l) => byLayer.has(l.key));
  const group = (l: (typeof layers)[number]) => (
    <Group
      key={l.key}
      label={l.label}
      accent={l.accent}
      marks={byLayer.get(l.key)!}
      open={!collapsed.has(l.key)}
      selected={selected}
      hidden={hidden}
      layerKey={l.key}
      onHide={(key) => setHidden(flip(key))}
      onToggle={() => setCollapsed(flip(l.key))}
      onGo={go}
      content={doc.content}
      where={where}
    />
  );
  const setLayers = (keys: string[], on: boolean) =>
    setHidden((h) => {
      const next = new Set(h);
      for (const key of keys) {
        if (on) next.delete(key);
        else next.add(key);
        // Either way the layer speaks for its instances again.
        for (const m of byLayer.get(key)!) next.delete(m.id);
      }
      return next;
    });
  // Select all and collapse all act on what is listed: this tab.
  const allOn = layers.every((l) => !hidden.has(l.key));
  const setAll = (on: boolean) =>
    setLayers(
      layers.map((l) => l.key),
      on,
    );

  const allOpen = layers.every((l) => !collapsed.has(l.key));
  const empty = ORDER.filter((t) => !byLayer.has(`c:${t}`));
  // Most names come up once; folded so the recurring ones stay readable.
  const once =
    tab === "m" ? layers.filter((l) => byLayer.get(l.key)!.length === 1) : [];

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
      <nav className="sticky top-0 flex h-screen w-[440px] shrink-0 flex-col border-r bg-card text-sm">
        <div className="flex flex-col gap-2.5 p-4">
          <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
            {(
              [
                ["c", `Classifications ${annotations.classifications.length}`],
                [
                  "m",
                  `Mentions ${annotations.mentions.length} · ${names.length} names`,
                ],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
                className={`h-10 rounded-sm font-bold ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between px-3 text-muted-foreground">
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={allOn}
                onChange={() => setAll(!allOn)}
                className="size-4 accent-primary"
              />
              {allOn ? "Deselect all" : "Select all"}
            </label>
            <button
              type="button"
              onClick={() =>
                setCollapsed(
                  allOpen ? new Set(layers.map((l) => l.key)) : new Set(),
                )
              }
              className="hover:text-foreground"
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-4 pb-4">
          {layers.filter((l) => !once.includes(l)).map(group)}
          {once.length > 0 && (
            <details
              open={once.some((l) => byLayer.get(l.key)![0]!.id === selected)}
            >
              <summary className="cursor-pointer rounded-sm px-3 py-1.5 text-muted-foreground hover:bg-secondary">
                {once.length} mentioned once
              </summary>
              <div className="flex flex-col gap-0.5">{once.map(group)}</div>
            </details>
          )}
          {tab === "c" && empty.length > 0 && (
            <p className="px-3 pt-2 text-xs leading-normal text-muted-foreground">
              Nothing found for {empty.join(", ")}.
            </p>
          )}
        </div>
      </nav>
      <div className="flex flex-1 justify-center bg-muted px-6 py-10">
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

/** One label of the index: its name and count, and under it every occurrence in reading order. */
function Group({
  label,
  accent,
  marks,
  open,
  selected,
  hidden,
  layerKey,
  onHide,
  onToggle,
  onGo,
  content,
  where,
}: {
  label: string;
  /** The checkbox carries the family colour, so it is the swatch too. */
  accent: string;
  marks: Mark[];
  open: boolean;
  selected: string | null;
  hidden: ReadonlySet<string>;
  layerKey: string;
  /** Switches a whole layer (by key) or one occurrence (by id) off and on. */
  onHide: (key: string) => void;
  onToggle: () => void;
  onGo: (m: Mark) => void;
  content: string;
  where: (elementId: string) => string;
}) {
  const at = marks.findIndex((m) => m.id === selected);
  const on = !hidden.has(layerKey);
  return (
    <div className="flex flex-col">
      <div className="flex h-10 shrink-0 items-center rounded-sm pl-3 hover:bg-secondary">
        <input
          type="checkbox"
          aria-label={`Show ${label}`}
          checked={on}
          onChange={() => onHide(layerKey)}
          className={`size-4 ${accent}`}
        />
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className={`flex h-full flex-1 items-center gap-2.5 px-2.5 text-left font-bold ${on ? "" : "text-muted-foreground line-through"}`}
        >
          <span className="flex-1 truncate">{label}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {at >= 0 ? `${at + 1} / ${marks.length}` : marks.length}
          </span>
          <span
            className={`mr-3 size-2 border-r-2 border-b-2 border-muted-foreground ${open ? "mb-1 rotate-45" : "-rotate-45"}`}
          />
        </button>
      </div>
      {open &&
        marks.map((m) => {
          const c = isC(m) ? undefined : context(content, m.span, 24);
          const shown = on && !hidden.has(m.id);
          return (
            <div
              key={m.id}
              data-row={m.id}
              className={`ml-5 flex h-[34px] items-center rounded-r-sm border-l pl-3.5 hover:bg-secondary ${m.id === selected ? "bg-primary/25 ring-1 ring-primary ring-inset" : ""}`}
            >
              <input
                type="checkbox"
                aria-label={`Show ${m.id}`}
                checked={shown}
                disabled={!on}
                onChange={() => onHide(m.id)}
                className={`size-3.5 ${accent}`}
              />
              <button
                type="button"
                aria-current={m.id === selected}
                // Something switched off is not in the document, so there is nowhere to jump to.
                disabled={!shown}
                onClick={() => onGo(m)}
                className="flex h-full min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-[13px] disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {c ? (
                    <>
                      …{c.pre}
                      <b className="text-foreground">{c.hit}</b>
                      {c.post}…
                    </>
                  ) : (
                    <>
                      <code className="pr-1.5 text-[11px]">{m.id}</code>
                      <span className="text-foreground">{m.text}</span>
                    </>
                  )}
                </span>
                <span className="max-w-[9rem] shrink-0 truncate text-[11px] text-muted-foreground">
                  {where(m.elementId)}
                </span>
              </button>
            </div>
          );
        })}
    </div>
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
        data-marks={s.marks.map((m) => m.id).join(" ")}
        title={s.marks
          .map((m) => `${m.id} ${isC(m) ? m.type : m.name}`)
          .join("\n")}
        // The margin chip is the keyboard path to the same selection.
        onClick={() => ctx.select((cls ?? men)!.id)}
        className={[
          "box-decoration-clone py-[3px]",
          "cursor-pointer",
          cls && familyOf(cls.type).tint[on ? 1 : ctx.parity.get(cls.id)!],
          on && `ring-2 ${familyOf(cls!.type).ring}`,
          men && `border-b-2 ${MENTION_LINE}`,
          men?.id === ctx.selected &&
            "rounded-[3px] bg-bright-cyan text-deepest",
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
          data-marks={whole.id}
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
