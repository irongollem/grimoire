// Pure logic for the `open-book` Edge Function (#1085), kept free of Deno and network imports so vitest can
// run it. `index.ts` does the lookups and hands the rows to the functions here.
//
// The response shape restates `PublicOpenBook` in src/types/openBook.types.ts; Deno cannot import that file,
// so the snapshot stays loosely typed here and the handler never reads inside it beyond the meta reduction.

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export const NOT_FOUND_BODY = JSON.stringify({ error: "not_found" });

export type OpenBookPart = "full" | "meta";

/** The slug is the last path segment, and must be a well-formed one; anything else is an unknown book. */
export function parseSlug(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const slug = parts[parts.length - 1];
  if (!slug || !SLUG_PATTERN.test(slug)) return null;
  return slug;
}

export function parsePart(search: string): OpenBookPart {
  return new URLSearchParams(search).get("part") === "meta" ? "meta" : "full";
}

export interface BookRow {
  slug: string;
  is_open: boolean;
  allow_pdf: boolean;
  indexable: boolean;
  live_release_id: string | null;
  updated_at: string;
}

export interface ReleaseRow {
  id: string;
  number: number;
  note: string | null;
  created_at: string;
  pdf_url: string | null;
  stats: unknown;
  snapshot: unknown;
}

export interface ServeFacts {
  book: BookRow | null;
  release: ReleaseRow | null;
  ownerId: string | null;
  /** null when the check failed, which refuses like any other error. */
  ownerIsChild: boolean | null;
  ownerIsPro: boolean | null;
}

/** The 404 decision table: a book is served only when every fact is present and favourable. */
export function canServe(f: ServeFacts): boolean {
  if (!f.book || !f.book.is_open || !f.book.live_release_id) return false;
  if (!f.release || f.release.id !== f.book.live_release_id) return false;
  if (!f.ownerId) return false;
  if (f.ownerIsChild !== false) return false;
  if (f.ownerIsPro !== true) return false;
  return true;
}

export interface PublicOpenBookBody {
  slug: string;
  allow_pdf: boolean;
  indexable: boolean;
  release: {
    number: number;
    note: string | null;
    created_at: string;
    pdf_url: string | null;
    stats: unknown;
  };
  snapshot: unknown;
}

export interface PublicOpenBookMetaBody extends Omit<PublicOpenBookBody, "snapshot"> {
  snapshot: { v: unknown; book: unknown; calendar: unknown };
  sessions: { id: string; title: string; number: number | null; image: string | null }[];
}

/**
 * The first picture in a session report's stored content (Tiptap JSON as a string), for its share card. Only an
 * https source; anything unparsable or pictureless gives null.
 */
export function firstImageSrc(content: unknown): string | null {
  if (typeof content !== "string" || content === "") return null;
  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch {
    return null;
  }
  const stack: unknown[] = [doc];
  while (stack.length > 0) {
    const node = stack.shift() as { type?: unknown; attrs?: { src?: unknown }; content?: unknown } | null;
    if (!node || typeof node !== "object") continue;
    if (node.type === "image" && typeof node.attrs?.src === "string" && node.attrs.src.startsWith("https://")) {
      return node.attrs.src;
    }
    if (Array.isArray(node.content)) stack.unshift(...node.content);
  }
  return null;
}

/** Only these columns ever leave: no campaign id, owner id or release id. */
export function buildFull(book: BookRow, release: ReleaseRow): PublicOpenBookBody {
  return {
    slug: book.slug,
    allow_pdf: book.allow_pdf,
    indexable: book.indexable,
    release: {
      number: release.number,
      note: release.note,
      created_at: release.created_at,
      // Only when the DM offers the PDF; a column check already holds it to https, this keeps a script URL off a
      // visitor's page whatever the row says.
      pdf_url: book.allow_pdf && release.pdf_url !== null && /^https:\/\//i.test(release.pdf_url) ? release.pdf_url : null,
      stats: release.stats,
    },
    snapshot: release.snapshot,
  };
}

/** The reduction the page-title and share-card relay reads instead of downloading the whole book. */
export function toMeta(full: PublicOpenBookBody): PublicOpenBookMetaBody {
  const snap = (full.snapshot ?? {}) as Record<string, unknown>;
  const rawSessions = Array.isArray(snap.sessions) ? snap.sessions : [];
  const sessions = rawSessions.map((s) => {
    const row = (s ?? {}) as { id?: unknown; title?: unknown; content?: unknown; session?: { number?: unknown } | null };
    const n = row.session?.number;
    return {
      id: String(row.id ?? ""),
      title: typeof row.title === "string" ? row.title : "",
      number: typeof n === "number" ? n : null,
      image: firstImageSrc(row.content),
    };
  });
  return {
    ...full,
    snapshot: { v: snap.v, book: snap.book, calendar: snap.calendar },
    sessions,
  };
}

export function buildBody(book: BookRow, release: ReleaseRow, part: OpenBookPart): PublicOpenBookBody | PublicOpenBookMetaBody {
  const full = buildFull(book, release);
  return part === "meta" ? toMeta(full) : full;
}

export function makeEtag(releaseId: string, updatedAt: string, part: OpenBookPart): string {
  return `"${releaseId}.${new Date(updatedAt).getTime().toString(36)}.${part}"`;
}

/** If-None-Match may list several validators, weak or strong, or be `*`. */
export function isNotModified(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  return ifNoneMatch.split(",").some((t) => t.trim().replace(/^W\//, "") === etag);
}
