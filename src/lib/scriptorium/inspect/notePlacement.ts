/**
 * Where Inspect notes sit in the laid-out book (#1115), without touching the DOM:
 * the layer measures its pages into `PageProbe`s and these functions decide.
 */
import type { ScriptoriumChapterSummary, ScriptoriumNote } from "@/types/scriptorium.types";

export interface PageProbe {
  /** Position among all the host's pages, blanks included (the layout's `globalIndex`). */
  index: number;
  chapterId: string | null;
  blank: boolean;
  /** Top-level blocks on this page, `top` in the page's own (unscaled) pixels, in reading order. */
  blocks: { id: string; top: number }[];
}

export interface NotePlacement {
  noteId: string;
  /** Null when the note's chapter has no page at all (an empty chapter). */
  pageIndex: number | null;
  top: number;
  /** The block it is really pinned to; null when it fell back to the chapter's first page. */
  blockId: string | null;
  /** Position among notes pinned to the same spot, so two pins do not sit on each other. */
  slot: number;
}

/** A block lives on its first page; a note whose block is gone goes to the top of its chapter's first page. */
export function placeNotes(notes: ScriptoriumNote[], pages: PageProbe[]): Map<string, NotePlacement> {
  const placements = new Map<string, NotePlacement>();
  const taken = new Map<string, number>();
  for (const note of [...notes].sort(byCreated)) {
    const own = pages.filter((page) => page.chapterId === note.chapter_id && !page.blank);
    let found: { page: PageProbe; top: number; blockId: string | null } | null = null;
    if (note.block_id !== null) {
      for (const page of own) {
        const block = page.blocks.find((candidate) => candidate.id === note.block_id);
        if (block) {
          found = { page, top: block.top, blockId: block.id };
          break;
        }
      }
    }
    if (!found && own.length > 0) found = { page: own[0], top: 0, blockId: null };
    if (!found) {
      placements.set(note.id, { noteId: note.id, pageIndex: null, top: 0, blockId: null, slot: 0 });
      continue;
    }
    const spot = `${found.page.index}:${found.top}`;
    const slot = taken.get(spot) ?? 0;
    taken.set(spot, slot + 1);
    placements.set(note.id, { noteId: note.id, pageIndex: found.page.index, top: found.top, blockId: found.blockId, slot });
  }
  return placements;
}

function byCreated(a: ScriptoriumNote, b: ScriptoriumNote): number {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

/** Book order: by page, then down the page; notes with no page last, by chapter order. */
export function orderNotes(
  notes: ScriptoriumNote[],
  chapters: ScriptoriumChapterSummary[],
  placements: Map<string, NotePlacement>,
): ScriptoriumNote[] {
  const chapterAt = (id: string) => {
    const at = chapters.findIndex((chapter) => chapter.id === id);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  return [...notes].sort((a, b) => {
    const pa = placements.get(a.id);
    const pb = placements.get(b.id);
    const ia = pa?.pageIndex ?? null;
    const ib = pb?.pageIndex ?? null;
    if (ia !== null && ib !== null) return ia - ib || (pa?.top ?? 0) - (pb?.top ?? 0) || (pa?.slot ?? 0) - (pb?.slot ?? 0);
    if (ia !== null) return -1;
    if (ib !== null) return 1;
    return chapterAt(a.chapter_id) - chapterAt(b.chapter_id) || byCreated(a, b);
  });
}

/** The notes on show, in book order, numbered from 1. Done notes join only when asked for. */
export function numberNotes(
  notes: ScriptoriumNote[],
  chapters: ScriptoriumChapterSummary[],
  placements: Map<string, NotePlacement>,
  showDone: boolean,
): { note: ScriptoriumNote; n: number }[] {
  return orderNotes(
    notes.filter((note) => showDone || !note.done),
    chapters,
    placements,
  ).map((note, at) => ({ note, n: at + 1 }));
}

/** What a click on a page pins to: the block under it, else the page's first block; nothing on a blank page or cover. */
export function noteTargetForClick(
  page: PageProbe,
  clickedBlockId: string | null,
): { chapterId: string; blockId: string } | null {
  if (page.blank || page.chapterId === null) return null;
  const blockId =
    clickedBlockId !== null && page.blocks.some((block) => block.id === clickedBlockId)
      ? clickedBlockId
      : (page.blocks[0]?.id ?? null);
  return blockId === null ? null : { chapterId: page.chapterId, blockId };
}

/** "1 · Page 193 · The Spiral's Heart"; the page part is left out while unknown. */
export function noteWhere(n: number, pageLabel: string | null, chapterTitle: string): string {
  return [String(n), pageLabel === null ? null : `Page ${pageLabel}`, chapterTitle].filter((part) => part !== null).join(" · ");
}
