/**
 * Markdown → Tiptap JSON conversion at the importer's DB-write boundary.
 *
 * The chapter NPC + faiths importers' parsers produce plain markdown for
 * rich-text fields (`appearance`, `personality`, `backstory`, `notes` on NPCs;
 * `description`, `dm_notes` on deities; `description` on pantheons). The Vue
 * `RichTextEditor` component binds those fields as Tiptap documents, so plain
 * markdown round-trips through the editor without formatting — the user has
 * to manually reformat every imported row.
 *
 * This module converts plain markdown into the canonical Tiptap JSON shape
 * the editor expects:
 *
 *   { "type": "doc",
 *     "attrs": { "twoColumn": false },
 *     "content": [ ... ProseMirror nodes ... ] }
 *
 * The conversion happens at the DB-write layer (insert/update payload build).
 * The merge engine still compares plain text on both sides — see the
 * `import-chapter-npcs.ts` design note for why that's the right call.
 *
 * Reuses the app's existing `parseMarkdown` from `src/lib/markdownToTiptap.ts`
 * (same converter the paste-handling pipeline uses).
 */

// Relative path — `@/` alias isn't resolved at runtime for value imports.
import { parseMarkdown } from "../../src/lib/markdownToTiptap";

/**
 * The doc node attrs the existing UI saves. `twoColumn: false` is the editor's
 * default; including it explicitly so importer output is byte-aligned with
 * what `RichTextEditor` writes when the user saves a fresh document.
 */
export const TIPTAP_DOC_ATTRS = { twoColumn: false } as const;

/**
 * Synth'd `**Label**\n{content}` blocks (used in NPC `notes` for Emotional
 * Core / Stage / Lens Variations / etc.) render as a single paragraph in the
 * raw converter because there's no blank line between the label and content.
 * Insert one before passing to the converter so each label is its own
 * paragraph — preserves the visual separation a reader expects.
 *
 * Only inserted when the bold-label is on its own line AND the following line
 * has content (not already blank). Idempotent — re-running yields the same
 * input if the blank already exists.
 */
function separateBoldLabelLines(md: string): string {
  return md.replace(/(^|\n)(\*\*[^*\n]+\*\*)\n(?!\n)/g, "$1$2\n\n");
}

/**
 * Convert a plain-markdown string to a Tiptap JSON document string.
 * Returns `null` for null/empty input (so it's safe to pipe through nullable
 * fields without producing `"{type:'doc',content:[]}"` rows).
 */
export function markdownToTiptap(md: string | null | undefined): string | null {
  if (md === null || md === undefined || md === "") return null;
  const trimmed = md.trim();
  if (trimmed === "") return null;
  const preprocessed = separateBoldLabelLines(md);
  return JSON.stringify({
    type: "doc",
    attrs: TIPTAP_DOC_ATTRS,
    content: parseMarkdown(preprocessed),
  });
}

/**
 * Apply `markdownToTiptap` to a named subset of string-or-null fields in a
 * payload object, returning a new object. Fields not present in the payload
 * are skipped; fields whose value is not a string are passed through
 * unchanged (so caller can safely point this at an `updates` map from the
 * merge engine — non-prose fields like `tags` arrays stay intact).
 */
export function tiptapifyFields<T extends Record<string, unknown>>(
  payload: T,
  fieldNames: readonly string[],
): T {
  const out = { ...payload };
  for (const f of fieldNames) {
    if (!(f in out)) continue;
    const v = out[f];
    if (typeof v === "string") {
      (out as Record<string, unknown>)[f] = markdownToTiptap(v);
    } else if (v === null) {
      // leave null as null (markdownToTiptap would too, but skip the call)
    }
  }
  return out;
}

/** Field sets — kept here so both importers reference the same source of truth. */
export const NPC_RICHTEXT_FIELDS = [
  "appearance",
  "personality",
  "backstory",
  "notes",
] as const;

export const DEITY_RICHTEXT_FIELDS = [
  "description",
  "dm_notes",
] as const;

export const PANTHEON_RICHTEXT_FIELDS = [
  "description",
] as const;
