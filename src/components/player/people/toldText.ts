/**
 * The line a player reads on a connection, as plain text. The DM writes it in the
 * rich editor on "With the party" (so it is stored as markup, and the old
 * connection notes arrived that way); a slip shows text, so the markup is read
 * through a parser, never injected.
 */
export function toldText(told: string | null): string | null {
  if (told === null) return null;
  const text = told.includes("<")
    ? (new DOMParser().parseFromString(told, "text/html").body.textContent ?? "")
    : told;
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}
