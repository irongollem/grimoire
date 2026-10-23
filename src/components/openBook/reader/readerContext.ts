import { inject, type ComputedRef, type InjectionKey } from "vue";
import type { ReadingMode } from "@/lib/openBook/pagination";
import type { BookModel } from "@/lib/openBook/bookModel";
import type { BookSection } from "@/lib/openBook/sections";
import type { Ribbon } from "@/lib/openBook/ribbons";

/** Where in the book a page sits: a section, and the turn within it. `order` sorts targets for turn direction. */
export interface PageTarget {
  key: string;
  unit: number;
  order: number;
}

/**
 * What every page of the reader needs from the reader that holds it. Provided by BookReader so a page, wherever the
 * turn mounts it (the open spread, or either face of a leaf mid-turn), draws itself from the same facts.
 */
export interface ReaderContext {
  model: ComputedRef<BookModel>;
  slug: ComputedRef<string>;
  sections: ComputedRef<BookSection[]>;
  mode: ComputedRef<ReadingMode>;
  ribbons: ComputedRef<Ribbon[]>;
  releaseLabel: ComputedRef<string>;
  /** Pages a section has: measured once it has been laid out, estimated before. */
  pagesOf(key: string): number;
  isMeasured(key: string): boolean;
  /** Whether a section opens with its chapter's title page; only a chapter's first section does. */
  hasFront(key: string): boolean;
  /** The folio of a section's first page. */
  folioStartOf(key: string): number;
  reportPages(key: string, count: number, layout: string): void;
  /** A focused link sits on a page that is not showing: turn to it. */
  revealPage(key: string, page: number): void;
}

export const READER_KEY: InjectionKey<ReaderContext> = Symbol("open-book-reader");

/** The reader a page is drawn inside. A page outside a BookReader is a programming error, not a state to render. */
export function useReaderContext(): ReaderContext {
  const ctx = inject(READER_KEY, null);
  if (!ctx) throw new Error("A book page must be drawn inside a BookReader");
  return ctx;
}
