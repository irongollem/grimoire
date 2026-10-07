/**
 * The optional "extract details with AI" pass over imported wiki pages (#932).
 *
 * The pages the DM ticks become ONE markdown document, which goes through an
 * ordinary `text` import (so the page ceiling, the credit charge and the
 * review all apply exactly as for a paste). A page is its title as a heading
 * and its body as markdown; links are flattened to their labels first, since a
 * link placeholder means nothing to a model.
 */
import { resolveArchiveLinks } from "./links";
import { tiptapToMarkdown } from "@/lib/tiptap/tiptapToMarkdown";
import { pagesForText } from "@/lib/documentImport/limits";
import type { ArchivePage } from "./types";

export function archivePageMarkdown(page: ArchivePage): string {
  const body = tiptapToMarkdown(resolveArchiveLinks(page.body, () => null)).trim();
  return body ? `# ${page.title}\n\n${body}` : `# ${page.title}`;
}

export interface ArchiveAiText {
  text: string;
  chars: number;
  /** Pages the import would be charged and capped as (`pagesForText`). */
  pages: number;
}

export function archiveAiText(pages: readonly ArchivePage[]): ArchiveAiText {
  const text = pages.map(archivePageMarkdown).join("\n\n");
  return { text, chars: text.length, pages: pagesForText(text.length) };
}
