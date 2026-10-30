/**
 * Carrying books between accounts and files: the World Bundle and the campaign
 * backup both move a Scriptorium book as its document row plus its chapter rows
 * (#1115), and both have to give every row a new id on the way in. One module
 * owns that, so the two cannot disagree about what a chapter's new id does to
 * the furniture pinned to it.
 */
import type { JSONContent } from "@tiptap/core";
import { freshId, type IdMap } from "@/lib/campaign/campaignSerialization";
import { chapterTitle, countWords } from "@/lib/scriptorium/chapterTitle";
import { normalizeImportedDocument } from "@/lib/scriptorium/documentContent";
import { parsePageFurniture } from "@/lib/scriptorium/furniture/model";
import type { PageFurnitureItem } from "@/types/scriptorium.types";

type Row = Record<string, unknown>;

/** The columns an exported chapter keeps: the rest (owner, timestamps) the importer owns. */
export const CHAPTER_EXPORT_STRIP = ["created_at", "updated_at"];

/**
 * Pins a page-anchored picture to the chapter's NEW id. Furniture whose chapter is
 * not among the imported ones has nowhere to be drawn, so it is dropped rather
 * than left pointing at a chapter id that belongs to another account's book.
 */
function followChapters(
  items: PageFurnitureItem[],
  newChapterId: (oldId: string) => string | undefined,
): PageFurnitureItem[] {
  const out: PageFurnitureItem[] = [];
  for (const item of items) {
    if (item.anchor.type !== "page") {
      out.push(item);
      continue;
    }
    const chapterId = newChapterId(item.anchor.chapterId);
    if (chapterId) out.push({ ...item, anchor: { ...item.anchor, chapterId } });
  }
  return out;
}

export interface BookTransferInput {
  documents: Row[];
  /** Absent in a file written before books had chapters. */
  chapters: Row[] | undefined;
  /** Already holds a new id for every document AND every chapter in the file. */
  idMap: IdMap;
  /** Rewrites a chapter body on the way in (the backup remaps mention ids). */
  mapContent?: (content: JSONContent) => JSONContent;
}

export interface BookTransferResult {
  /** Without `content` and `word_count`: the text is in the chapters, and the count is the database's. */
  documents: Row[];
  chapters: Row[];
}

/**
 * Rows ready to insert, books first and then chapters. The caller adds what only
 * it knows (owner, campaign, audience) to the documents.
 *
 * A document that still carries a `content` column comes from a file written
 * before chapters existed: it becomes one chapter. That is reading an old file
 * format at the door, after which only the chapter shape exists.
 */
export function remapBooksForImport(input: BookTransferInput): BookTransferResult {
  const { idMap, mapContent } = input;
  const documents: Row[] = [];
  const chapters: Row[] = [];
  // One new id per book, minted once: its chapters point at the same one.
  const bookIds = new Map<string, string>();

  const chapterRow = (documentId: string, position: number, content: JSONContent, id: string): Row => {
    const mapped = mapContent ? mapContent(content) : content;
    return {
      id,
      document_id: documentId,
      position,
      title: chapterTitle(mapped),
      content: mapped,
      word_count: countWords(mapped),
    };
  };

  for (const doc of input.documents) {
    const { content: legacyContent, word_count: _count, ...book } = doc;
    const documentId = freshId(doc.id, idMap);
    bookIds.set(doc.id as string, documentId);
    let furniture: PageFurnitureItem[];

    if ("content" in doc) {
      const chapterId = crypto.randomUUID();
      // Its one chapter holds all of its pages, so every page picture follows it.
      furniture = followChapters(parsePageFurniture(doc.page_furniture), () => chapterId);
      const normalized = normalizeImportedDocument({ content: legacyContent }, chapterId);
      furniture = [...furniture, ...normalized.page_furniture];
      chapters.push(chapterRow(documentId, 0, normalized.content, chapterId));
    } else {
      furniture = followChapters(parsePageFurniture(doc.page_furniture), (oldId) => idMap.get(oldId));
    }

    documents.push({ ...book, id: documentId, page_furniture: furniture });
  }

  for (const chapter of input.chapters ?? []) {
    const documentId = bookIds.get(chapter.document_id as string);
    if (!documentId) continue;
    const id = freshId(chapter.id, idMap);
    const normalized = normalizeImportedDocument({ content: chapter.content }, id);
    // A picture lifted out of this chapter's body belongs on its book.
    if (normalized.page_furniture.length > 0) {
      const book = documents.find((doc) => doc.id === documentId);
      if (book) book.page_furniture = [...(book.page_furniture as PageFurnitureItem[]), ...normalized.page_furniture];
    }
    chapters.push(chapterRow(documentId, chapter.position as number, normalized.content, id));
  }

  return { documents, chapters };
}
