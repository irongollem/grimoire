/**
 * Format-neutral string utilities shared by every embed-text builder
 * (monsterEmbedText.ts, entityEmbedText.ts, and whatever entity type #599
 * adds next).
 *
 * These sit BELOW the per-entity format contracts: each builder's module doc
 * warns that changing its output format invalidates that entity type's stored
 * `source_hash`es and forces a full re-embed. Changing anything in THIS file
 * changes the output of every builder at once — a full re-embed for every
 * embedded entity type in the app. Treat the behavior here as frozen; if a
 * builder needs different truncation or normalization, it writes its own
 * variant locally rather than altering these.
 */

/** Collapse any run of whitespace (spaces, tabs, newlines) to a single space and trim. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Truncate `text` to at most `maxLength` characters, backing off to the
 * previous space so a word is never cut in half. If no space is found within
 * the window (a single very long "word"), falls back to a hard cut.
 */
export function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const window = text.slice(0, maxLength);
  const lastSpace = window.lastIndexOf(" ");
  return lastSpace > 0 ? window.slice(0, lastSpace) : window;
}

/**
 * Stable lowercase-hex SHA-256 — the value stored as an embedding row's
 * `source_hash` so a backfill can skip rows whose text hasn't changed. Uses
 * Web Crypto (`crypto.subtle`), available as a global in both Deno (the edge
 * function runtime) and Node 18+ (vitest), so this one implementation runs
 * unmodified in both.
 */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
