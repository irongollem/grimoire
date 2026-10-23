export type OpenBookErrorKind = "requires_pro" | "not_set_up" | "not_authorized" | "slug_taken" | "unknown";

/** Maps a PostgREST or RPC error to what the Open Book UI can say about it. */
export function classifyOpenBookError(error: unknown): OpenBookErrorKind {
  if (typeof error !== "object" || error === null) return "unknown";
  const { code, message, details } = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${typeof message === "string" ? message : ""} ${typeof details === "string" ? details : ""}`;
  if (text.includes("open_book_requires_pro")) return "requires_pro";
  if (text.includes("open_book_not_set_up")) return "not_set_up";
  if (code === "23505" && text.includes("open_books_slug_key")) return "slug_taken";
  if (code === "42501" || text.includes("Not authorized")) return "not_authorized";
  return "unknown";
}
