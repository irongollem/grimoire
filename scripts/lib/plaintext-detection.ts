/**
 * Detect whether a stored field value is already Tiptap JSON or still plain
 * text / markdown. Used by `scripts/migrate-plaintext-to-tiptap.ts` to decide
 * which rows need conversion and which to skip — the same logic could be
 * shared with any future migration touching Tiptap-typed fields.
 *
 * Detection rule (intentionally simple):
 *
 *   - empty / null / whitespace-only             → "empty"
 *   - parses as JSON AND root.type === "doc"     → "tiptap"   (already converted)
 *   - parses as JSON but root.type is something else (e.g. legacy ProseMirror
 *     dump, or some other JSON-shaped non-Tiptap value)
 *                                                → "unknown-json" (flag, don't convert)
 *   - everything else (including invalid JSON,
 *     plain prose with `{` glyphs, markdown,
 *     plain strings)                             → "plaintext" (convert)
 *
 * The "unknown-json" case is rare but worth surfacing — converting a legacy
 * ProseMirror dump as if it were plaintext would corrupt the row.
 */

export type FieldFormat = "empty" | "tiptap" | "unknown-json" | "plaintext";

export function detectFieldFormat(value: unknown): FieldFormat {
  if (value === null || value === undefined) return "empty";
  if (typeof value !== "string") return "unknown-json";
  if (value.trim() === "") return "empty";

  // Cheap pre-filter: Tiptap docs always start with `{`. If the value clearly
  // isn't JSON-shaped, skip the parse attempt.
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return "plaintext";

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return "plaintext";
  }
  if (typeof parsed !== "object" || parsed === null) return "unknown-json";
  const root = parsed as { type?: unknown };
  if (root.type === "doc") return "tiptap";
  return "unknown-json";
}

/** Convenience: true iff the value needs conversion (plaintext, non-empty). */
export function needsConversion(value: unknown): boolean {
  return detectFieldFormat(value) === "plaintext";
}
