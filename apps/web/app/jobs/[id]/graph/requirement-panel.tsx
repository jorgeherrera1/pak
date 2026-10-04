"use client";

import type { Classification } from "@dark-factory/annotate";
import { X } from "lucide-react";
import Link from "next/link";
import { CATEGORY, familyOf, owner } from "@/lib/vocabulary";
import { anchor } from "../reader-parts";
import { Fact, Facts } from "./element-panel";

/** The selected requirement: its type, the words it quotes, and the element they were found in. */
export function RequirementPanel({
  jobId,
  r,
  onSelect,
  onClose,
}: {
  jobId: string;
  r: Classification;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const f = familyOf(r.type);
  return (
    <aside
      aria-label={`Selected: ${r.id}`}
      className="flex w-[420px] shrink-0 flex-col gap-6 overflow-y-auto border-l bg-card p-8 *:shrink-0"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span
            className={`font-display text-eyebrow tracking-eyebrow uppercase ${f.ink}`}
          >
            {r.type}
          </span>
          <h2 className="font-display text-h4 font-bold break-all">{r.id}</h2>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-xs p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </div>

      <blockquote
        className={`rounded-sm border-l-[3px] bg-muted p-4 text-body leading-relaxed text-pretty ${f.line}`}
      >
        {r.text}
      </blockquote>
      <Facts>
        {r.category && (
          <Fact term="Category">
            {r.category} · {CATEGORY[r.category]}
          </Fact>
        )}
        <Fact term="FROM">
          {/* A cell is drawn as its table, so that is what gets selected. */}
          <button
            type="button"
            onClick={() => onSelect(owner(r.elementId))}
            className="text-left text-primary hover:text-action-hover"
          >
            {r.elementId}
          </button>
        </Fact>
      </Facts>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/jobs/${jobId}/annotate#${anchor(owner(r.elementId))}`}
          className="flex h-11 items-center rounded-sm bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-action-hover"
        >
          Show in reader
        </Link>
      </div>
    </aside>
  );
}
