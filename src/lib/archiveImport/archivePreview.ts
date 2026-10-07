/**
 * What a page will look like once it is a record, for the review's expand
 * panel (#932): the same split `fieldsForKind` makes for the sweep, labelled
 * by the column each part lands in. Links show as their plain label here; they
 * become mentions on import where the target is a place, faction or NPC.
 */
import { fieldsForKind } from "./fields";
import { docColumnsOf } from "./archiveRows";
import { resolveArchiveLinks } from "./links";
import type { ArchivePage, ArchivePageKind, TiptapDoc } from "./types";

export interface PreviewSection {
  label: string;
  /** Rich text, as it will be stored. */
  doc?: TiptapDoc;
  /** Plain text (a quest's one-line summary). */
  text?: string;
}

const COLUMN_LABELS: Record<string, string> = {
  appearance: "Appearance",
  personality: "Personality",
  backstory: "Backstory",
  notes: "DM notes",
  description: "Description",
  dm_content: "Opening beat (DM notes)",
  content: "Note",
};

export function previewSections(page: ArchivePage, kind: Exclude<ArchivePageKind, "skip">): PreviewSection[] {
  const fields = fieldsForKind(page, kind);
  const sections: PreviewSection[] = [];
  if (fields.kind === "quest" && fields.summary) sections.push({ label: "Summary", text: fields.summary });
  for (const column of docColumnsOf(fields)) {
    sections.push({ label: COLUMN_LABELS[column.column] ?? column.column, doc: resolveArchiveLinks(column.doc, () => null) });
  }
  return sections;
}
