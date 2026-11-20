/**
 * A Scriptorium book as a source for the document import (#1226 story 7, frame 10: "a book taken apart").
 *
 * A book is the DM's own writing, so it goes through the same `text` source a pasted page does: the chapters the DM
 * ticked become one markdown text, and nothing about the import's schema changes. Three things in a book are not
 * prose and are settled here:
 *
 * - an `entityEmbed` is a live link to something the campaign already has. It becomes the linked thing's name as a
 *   heading line, so the extraction names it and the review finds it exactly, and links to it by default;
 * - a `secretBlock` keeps its text (`tiptapToMarkdown` renders it as a DM-only callout): this is the DM's own book,
 *   and a secret is what the canon's secrets and the quests' hidden beats are made of;
 * - a cover page and a contents block are dropped: they restate the title and the headings and say nothing about
 *   the world.
 */
import type { JSONContent } from "@tiptap/core";
import { collectEntityRefs, entityRefKey, type EntityRef } from "@/scriptorium/lib/entityEmbeds";
import { tiptapToMarkdown } from "@/lib/tiptap/tiptapToMarkdown";
import { pagesForText, validateTextImport, type UploadValidationResult } from "./limits";

/** The part of a chapter the import reads. */
export interface BookChapterSource {
  id: string;
  position: number;
  title: string;
  content: JSONContent;
}

/** `entityRefKey` → the linked thing's name, for every embed the names could be found for. */
export type EmbedNames = ReadonlyMap<string, string>;

/** The import's name for a book: "Book: The Drowned Shrine". */
export function bookImportName(bookTitle: string): string {
  return `Book: ${bookTitle.trim()}`;
}

/** Every thing the chapters link to, once each, so their names can be read in one request per kind. */
export function embedRefsOf(chapters: readonly BookChapterSource[]): EntityRef[] {
  const seen = new Map<string, EntityRef>();
  for (const chapter of chapters) {
    for (const ref of collectEntityRefs(chapter.content)) seen.set(entityRefKey(ref), ref);
  }
  return [...seen.values()];
}

/**
 * The chapters as one markdown text, in book order. A chapter that says nothing (a cover and a contents page only)
 * adds nothing, so it costs no page.
 */
export function bookToMarkdown(chapters: readonly BookChapterSource[], names: EmbedNames): string {
  return [...chapters]
    .sort((a, b) => a.position - b.position)
    .map((chapter) =>
      tiptapToMarkdown(chapter.content, {
        embed: ({ entityType, entityId }) => names.get(entityRefKey({ type: entityType as EntityRef["type"], id: entityId })) ?? null,
      }),
    )
    .filter((text) => text.length > 0)
    .join("\n\n");
}

export interface BookSelectionSize {
  markdown: string;
  charCount: number;
  pageCount: number;
  /** Null for an empty selection, which has no size to judge. */
  validation: UploadValidationResult | null;
}

/** What the ticked chapters would cost as an import: their text, its pages, and whether the plan's page cap allows it. */
export function bookSelectionSize(chapters: readonly BookChapterSource[], names: EmbedNames, isPro: boolean): BookSelectionSize {
  const markdown = bookToMarkdown(chapters, names);
  const charCount = markdown.length;
  return {
    markdown,
    charCount,
    pageCount: pagesForText(charCount),
    validation: charCount > 0 ? validateTextImport(charCount, isPro) : null,
  };
}

/**
 * The books the import offers: this campaign's own and the account-wide ones (no campaign), never another
 * campaign's, and never a handout (a handout is a book of one chapter on a paper, handed to players, not a source).
 */
export function importableBooks<T extends { kind: string; campaign_id: string | null }>(documents: readonly T[], campaignId: string): T[] {
  return documents.filter((doc) => doc.kind === "book" && (doc.campaign_id === null || doc.campaign_id === campaignId));
}
