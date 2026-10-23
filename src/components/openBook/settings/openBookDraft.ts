import { OPEN_BOOK_CHAPTERS, type OpenBook, type OpenBookChapter } from "@/types/openBook.types";
import type { OpenBookSettings } from "@/composables/openBook/useOpenBook";
import { isValidOpenBookSlug } from "@/lib/openBook/slug";

/** The fields of the book the settings form edits; exactly what `useSaveOpenBook` sends. */
export type OpenBookDraft = Required<OpenBookSettings>;

export function bookToDraft(book: OpenBook): OpenBookDraft {
  return {
    slug: book.slug,
    title: book.title,
    subtitle: book.subtitle,
    cover_art: book.cover_art,
    cover_image_url: book.cover_image_url,
    leather: book.leather,
    chapters: [...book.chapters],
    include_shared: book.include_shared,
    allow_pdf: book.allow_pdf,
    indexable: book.indexable,
  };
}

function orderedChapters(chapters: OpenBookChapter[]): OpenBookChapter[] {
  return OPEN_BOOK_CHAPTERS.filter((c) => chapters.includes(c));
}

/** Chapters compare as a set: ticking and unticking one must not read as a change. */
export function draftsEqual(a: OpenBookDraft, b: OpenBookDraft): boolean {
  return (
    JSON.stringify({ ...a, chapters: orderedChapters(a.chapters) }) ===
    JSON.stringify({ ...b, chapters: orderedChapters(b.chapters) })
  );
}

export function draftCanSave(draft: OpenBookDraft): boolean {
  return draft.title.trim() !== "" && isValidOpenBookSlug(draft.slug);
}
