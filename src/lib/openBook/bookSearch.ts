/**
 * Searching the book from the desk bar (#1085). Entirely local: the snapshot is already in the page, so a search is
 * a filter over entry titles and their one-line subtitles. No network, nothing recorded.
 */

import type { BookEntryRef, BookModel } from "./bookModel";

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Lower is better. `null` is no match. */
function rank(entry: BookEntryRef, tokens: readonly string[], whole: string): number | null {
  const title = fold(entry.title);
  const subtitle = fold(entry.subtitle ?? "");
  const words = title.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    if (title.startsWith(token)) score += 0;
    else if (words.some((w) => w.startsWith(token))) score += 1;
    else if (title.includes(token)) score += 2;
    else if (subtitle.includes(token)) score += 4;
    else return null;
  }
  return title === whole ? score - 1 : score;
}

export function searchBook(model: BookModel, query: string, limit = 12): BookEntryRef[] {
  const whole = fold(query).trim().replace(/\s+/g, " ");
  if (!whole) return [];
  const tokens = whole.split(" ");
  const hits: { entry: BookEntryRef; score: number; order: number }[] = [];
  model.entries.forEach((entry, order) => {
    const score = rank(entry, tokens, whole);
    if (score !== null) hits.push({ entry, score, order });
  });
  hits.sort((a, b) => a.score - b.score || a.order - b.order);
  return hits.slice(0, limit).map((h) => h.entry);
}
