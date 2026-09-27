/**
 * Escape text for HTML, safe in element content and in a double- or
 * single-quoted attribute value alike.
 *
 * One copy on purpose. There were six private ones (the print composable,
 * sanitizeHtml, renderTiptap, the Scriptorium formatter, the table of contents
 * and the entity-art figures) and they had drifted: three left quotes alone,
 * so a name like Rosetta "Rosie" Vermeil ended an `alt` attribute early
 * wherever it landed in one (#917).
 */
const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c] as string);
}
