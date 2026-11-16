const wordChar = /[\p{L}\p{N}]/u;
/** How Azure Document Intelligence writes a checkbox-like glyph into the text. */
const MARK = /:(?:un)?selected:/y;
const PUNCT: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
};

/**
 * `text` folded for comparison: lower case, whitespace runs and selection
 * marks as one space, typographic quotes and dashes as ASCII. `at[i]` is the
 * offset in `content` of the source character behind `folded[i]`.
 */
export function fold(text: string, base = 0): { folded: string; at: number[] } {
  let folded = "";
  const at: number[] = [];
  for (let i = 0; i < text.length; ) {
    MARK.lastIndex = i;
    const mark = MARK.exec(text)?.[0];
    const ch = text[i]!;
    const out = mark || /\s/.test(ch) ? " " : (PUNCT[ch] ?? ch).toLowerCase();
    if (!(out === " " && folded.endsWith(" "))) {
      folded += out;
      for (let k = 0; k < out.length; k++) at.push(base + i);
    }
    i += mark ? mark.length : 1;
  }
  return { folded, at };
}

/** First occurrence of `needle` in `hay[from, end)` that sits on word boundaries, or -1. */
export function find(
  hay: string,
  needle: string,
  from = 0,
  end = hay.length,
): number {
  for (
    let i = hay.indexOf(needle, from);
    i >= 0 && i + needle.length <= end;
    i = hay.indexOf(needle, i + 1)
  ) {
    const before = hay[i - 1] ?? "";
    const after = hay[i + needle.length] ?? "";
    if (!wordChar.test(before) && !wordChar.test(after)) return i;
  }
  return -1;
}
