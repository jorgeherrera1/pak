import type { Cell, Element } from "@dark-factory/parse";
import type { ReactNode } from "react";

// No "use client" and no hooks: the Parse reader is a server component and hands `Table` a function.

/** "sections/3" → "sections-3": the reader's DOM id for an element, usable as a fragment. */
export const anchor = (id: string) => id.replaceAll("/", "-");

/** A state updater that adds `key` to a set, or removes it if present. */
export const flip = (key: string) => (set: ReadonlySet<string>) => {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
};

export function PageDivider({ page }: { page: number }) {
  return (
    <div className="flex items-center gap-3 pt-4 font-display text-xs font-bold tracking-eyebrow text-muted-foreground uppercase">
      Page {page}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function Table({
  e,
  className,
  cellClassName,
  cell,
}: {
  e: Extract<Element, { kind: "table" }>;
  className: string;
  cellClassName: string;
  cell: (c: Cell) => ReactNode;
}) {
  const grid: (Cell | undefined)[][] = Array.from({ length: e.rows }, () =>
    Array.from({ length: e.cols }),
  );
  for (const c of e.cells) grid[c.row]![c.col] = c;
  return (
    <table className={className}>
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
                  className={cellClassName}
                >
                  {cell(c)}
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Figure({
  e,
  figureBase,
  children,
}: {
  e: Extract<Element, { kind: "figure" }>;
  figureBase: string;
  children?: ReactNode;
}) {
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
      {children}
      {e.caption && (
        <figcaption className="text-sm text-muted-foreground">
          {e.caption}
        </figcaption>
      )}
    </figure>
  );
}
