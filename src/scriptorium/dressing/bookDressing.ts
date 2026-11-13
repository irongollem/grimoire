/*
 * What the chapter editor needs to dress its pages (#1181): the book's dressing, and which physical page of the
 * whole book each page of the open chapter is. Only the layout knows the second (blank pages and covers count), so
 * the book editor provides it from the layout the preview last made, and the editor's page layer reads it. Nothing
 * here is a second layout: it is what the one layout wrote, the numbers the paged preview and the PDF dress by.
 */
import { computed, type ComputedRef, type InjectionKey } from "vue";
import type { BookLayoutResult } from "@/scriptorium/lib/bookLayout/types";
import type { Dressing, PageKind } from "@/scriptorium/dressing/dressing";

export interface DressedPage {
  /** The page's place in the whole book, 1-based; a cover and a blank page count. */
  number: number;
  kind: PageKind;
}

export interface BookDressing {
  /** The dressing the pages carry, already resolved for the book's finish (ink-friendly is null). */
  dressing: ComputedRef<Dressing | null>;
  handout: ComputedRef<boolean>;
  /** Every page of the laid-out book that belongs to a chapter, by `pageKey`; empty before the first layout. */
  pages: ComputedRef<ReadonlyMap<string, DressedPage>>;
}

export const BOOK_DRESSING_KEY: InjectionKey<BookDressing> = Symbol("scriptorium-book-dressing");

export const pageKey = (chapterId: string, page: number): string => `${chapterId}\u0000${page}`;

export function bookDressing(opts: {
  dressing: () => Dressing | null;
  handout: () => boolean;
  layout: () => BookLayoutResult | null;
}): BookDressing {
  return {
    dressing: computed(opts.dressing),
    handout: computed(opts.handout),
    pages: computed(() => {
      const map = new Map<string, DressedPage>();
      for (const p of opts.layout()?.pages ?? []) {
        if (p.pageInChapter === null) continue;
        map.set(pageKey(p.chapterId, p.pageInChapter), { number: p.globalIndex + 1, kind: p.cover ? "cover" : "text" });
      }
      return map;
    }),
  };
}
