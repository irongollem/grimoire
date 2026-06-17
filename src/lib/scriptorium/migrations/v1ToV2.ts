/*
 * Scriptorium content migration v1 → v2 (Phase B, #330).
 *
 * Under manual pagination every top-level `<hr>` (horizontalRule node) was a
 * hard page break — the preview split content on it. Paged.js paginates
 * automatically, so we convert those breaks into explicit `pageBreak` hint
 * nodes. Intent is preserved exactly: a v1 doc migrated to v2 forces a new
 * page at each former `<hr>`, so it paginates the same way it always did.
 *
 * Pure and deterministic — unit-tested in v1ToV2.test.ts. Applied lazily on
 * document open (see content_version on the row) and by a one-off batch script.
 *
 * Only TOP-LEVEL horizontalRules are converted: an `<hr>` nested inside a
 * callout/cover/table was decoration, never a page break, and is left alone.
 */

import type { JSONContent } from "@tiptap/core";

export const SCRIPTORIUM_CONTENT_VERSION = 2;

/**
 * Convert top-level `horizontalRule` nodes to `pageBreak` nodes.
 * Returns a new doc; the input is not mutated. Non-doc / empty input is
 * returned unchanged.
 */
export function migrateV1ToV2(doc: JSONContent): JSONContent {
  if (!doc || doc.type !== "doc" || !Array.isArray(doc.content)) return doc;
  return {
    ...doc,
    content: doc.content.map((node) =>
      node?.type === "horizontalRule" ? { type: "pageBreak" } : node,
    ),
  };
}

/** True if the doc still contains a top-level horizontalRule (i.e. needs v2). */
export function needsV1ToV2(doc: JSONContent): boolean {
  return (
    !!doc &&
    doc.type === "doc" &&
    Array.isArray(doc.content) &&
    doc.content.some((n) => n?.type === "horizontalRule")
  );
}
