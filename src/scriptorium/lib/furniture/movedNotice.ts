/** The quiet footer line after a new layout carries pictures to another page with their paragraphs (#1176). */
export function movedNoticeText(pages: readonly number[]): string {
  if (pages.length === 1) return `The picture moved to page ${pages[0]} with its paragraph.`;
  return `${pages.length} pictures moved with their paragraphs.`;
}
