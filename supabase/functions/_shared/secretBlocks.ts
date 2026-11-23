// DM-only passages (`secretBlock`, #932) and the one way text leaves the DM's side as plain text: stripped first.
// Pure, so the browser may import it too. `private.withhold_secret_blocks` does the same for a player's copy.

import { tiptapToPlainText, type MentionNameOf } from "../../../src/lib/tiptap/tiptapText.ts";

/** Removes every `secretBlock` node, at any depth. */
export function withoutSecretBlocks(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutSecretBlocks).filter((n) => n !== null);
  if (typeof node !== "object" || node === null) return node;
  const record = node as Record<string, unknown>;
  if (record.type === "secretBlock") return null;
  if (Array.isArray(record.content)) return { ...record, content: withoutSecretBlocks(record.content) };
  return record;
}

/**
 * Plain text of a stored rich-text value with its DM-only passages left out. A value that is not a Tiptap document
 * is plain text and has no secret blocks to strip. A mention reads as `nameOf` names it, else as nothing. Use this, never `tiptapToPlainText`, for anything an AI is told.
 */
export function plainWithoutSecrets(value: string | null | undefined, nameOf?: MentionNameOf): string {
  if (!value) return "";
  try {
    const doc: unknown = JSON.parse(value);
    if (typeof doc === "object" && doc !== null) return tiptapToPlainText(JSON.stringify(withoutSecretBlocks(doc)), nameOf);
  } catch {
    // Legacy plain text.
  }
  return tiptapToPlainText(value, nameOf);
}
