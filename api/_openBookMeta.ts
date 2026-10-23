// Share tags for a public Open Book (#1085): what a link unfurler or a search crawler reads.
//
// Neither runs JavaScript, and vercel.json used to rewrite every path to one static index.html, so /w/<slug>
// unfurled as the generic app card and a book could not be found by title. api/open-book-page.ts now answers
// /w/* instead: it takes the deployment's own index.html, asks the `open-book` Edge Function for the book's
// meta, and swaps the title, description, Open Graph / Twitter tags, robots and canonical for the book's (or
// the session's, for /w/<slug>/chronicle/<noteId>). The SPA then boots from the very same HTML.
//
// Everything here is pure (fetch is injected) so vitest covers it. The file starts with an underscore, so
// Vercel does not deploy it as a function of its own (see _rsvpRelay.ts).

import type { PublicOpenBookMeta } from "../src/types/openBook.types.js";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Well under the platform's function limit, so a stalled upstream falls through to the plain page. */
const UPSTREAM_TIMEOUT_MS = 4_000;

/** A book slug as the `open_books` table mints it; anything else never reaches the network. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface BookPath {
  slug: string;
  /** `contents`, `index`, or a chapter key. Not validated here: the SPA owns the routing. */
  chapter: string | null;
  /** The entry (or, under `chronicle`, the session note) id. */
  entryId: string | null;
}

/** `slug`, `slug/chapter`, `slug/chapter/entryId` from the rewrite's `path` parameter. Null for anything unusable. */
export function parseBookPath(raw: string | null | undefined): BookPath | null {
  if (!raw) return null;
  const parts = raw
    .split("/")
    .filter((p) => p !== "")
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return null;
      }
    });
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => p === null)) return null;
  const [slug, chapter, entryId] = parts as string[];
  if (!SLUG_RE.test(slug)) return null;
  if (chapter !== undefined && !ID_RE.test(chapter)) return null;
  if (entryId !== undefined && !ID_RE.test(entryId)) return null;
  return { slug, chapter: chapter ?? null, entryId: entryId ?? null };
}

export interface ShareCard {
  kind: "book" | "session";
  title: string;
  description: string;
  /** Text for og:image:alt. */
  imageAlt: string;
  /** Path + query of the card image, relative to the deployment's origin. */
  imagePath: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const ROMAN: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

/** "XIV" for 14. Anything outside 1..3999 is left as digits. */
export function roman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n);
  let rest = n;
  let out = "";
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "64 places · 41 people · 14 sessions", skipping zeros. Empty when there is nothing to count. */
export function statsLine(stats: PublicOpenBookMeta["release"]["stats"] | undefined, separator = " · "): string {
  if (!stats) return "";
  const bits = [
    stats.places > 0 ? plural(stats.places, "place", "places") : "",
    stats.folk > 0 ? plural(stats.folk, "person", "people") : "",
    stats.sessions > 0 ? plural(stats.sessions, "session", "sessions") : "",
  ].filter(Boolean);
  return bits.join(separator);
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** The session this path names, if it is `chronicle/<id>` and the id is in the book's index. */
export function findSession(path: BookPath, meta: PublicOpenBookMeta): PublicOpenBookMeta["sessions"][number] | null {
  if (path.chapter !== "chronicle" || !path.entryId) return null;
  return meta.sessions.find((s) => s.id === path.entryId) ?? null;
}

/** What to say about this page: the session's card for a session path, else the book's. */
export function chooseCard(path: BookPath, meta: PublicOpenBookMeta): ShareCard {
  const book = meta.snapshot.book;
  const bookTitle = book.title;
  const version = String(meta.release.number);
  const base = `/api/open-book-card?slug=${encodeURIComponent(path.slug)}`;
  const session = findSession(path, meta);
  if (session) {
    const label = session.number != null ? `Session ${roman(session.number)}` : "A session";
    return {
      kind: "session",
      title: `${session.title} · ${bookTitle}`,
      description: `${label} of ${bookTitle}, an Open Book.`,
      imageAlt: `${label}: ${session.title}, from ${bookTitle}`,
      imagePath: `${base}&session=${encodeURIComponent(session.id)}&v=${version}`,
    };
  }
  const stats = statsLine(meta.release.stats, ", ");
  const lead = book.subtitle ? clip(book.subtitle, 160) : `An Open Book of ${bookTitle}`;
  const description = clip(`${lead.replace(/[.\s]+$/, "")}.${stats ? ` ${stats}.` : ""}`, 280);
  return {
    kind: "book",
    title: `${bookTitle} · an Open Book`,
    description,
    imageAlt: `${bookTitle}, an Open Book${book.subtitle ? `: ${book.subtitle}` : ""}`,
    imagePath: `${base}&v=${version}`,
  };
}

/** A book is indexed only when its owner said so; a missing or closed book never is. */
export function robotsContent(meta: PublicOpenBookMeta | null): "noindex" | null {
  return meta?.indexable === true ? null : "noindex";
}

const META_TAG_RE = (attr: "property" | "name", key: string) =>
  new RegExp(`<meta\\s+${attr}="${key.replace(/[:.]/g, "\\$&")}"[^>]*>`, "i");

function metaTag(attr: "property" | "name", key: string, content: string): string {
  return `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
}

/** Replace a meta tag in place, or add it before </head> when index.html does not carry one. */
function setMeta(html: string, attr: "property" | "name", key: string, content: string): string {
  const tag = metaTag(attr, key, content);
  const re = META_TAG_RE(attr, key);
  // A function replacement, so `$&` and friends in user text are never interpreted.
  return re.test(html) ? html.replace(re, () => tag) : html.replace(/<\/head>/i, () => `    ${tag}\n  </head>`);
}

export interface PageTags {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  robots: "noindex" | null;
}

/** Swap the head's title, description, og:* and twitter:* for these, add robots and canonical. */
export function applyTags(indexHtml: string, tags: PageTags): string {
  let html = indexHtml.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(tags.title)}</title>`);
  html = setMeta(html, "name", "description", tags.description);
  html = setMeta(html, "property", "og:type", "book");
  html = setMeta(html, "property", "og:title", tags.title);
  html = setMeta(html, "property", "og:description", tags.description);
  html = setMeta(html, "property", "og:url", tags.url);
  html = setMeta(html, "property", "og:image", tags.image);
  html = setMeta(html, "property", "og:image:width", "1200");
  html = setMeta(html, "property", "og:image:height", "630");
  html = setMeta(html, "property", "og:image:alt", tags.imageAlt);
  html = setMeta(html, "name", "twitter:card", "summary_large_image");
  html = setMeta(html, "name", "twitter:title", tags.title);
  html = setMeta(html, "name", "twitter:description", tags.description);
  html = setMeta(html, "name", "twitter:image", tags.image);
  html = setMeta(html, "name", "twitter:image:alt", tags.imageAlt);
  return addHeadExtras(html, tags.url, tags.robots);
}

/** Robots and canonical, for pages that keep the generic tags (a closed or unknown book). */
export function addHeadExtras(html: string, canonicalUrl: string | null, robots: "noindex" | null): string {
  const extras: string[] = [];
  if (robots) extras.push(metaTag("name", "robots", robots));
  if (canonicalUrl) extras.push(`<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`);
  if (extras.length === 0) return html;
  return html.replace(/<\/head>/i, () => `    ${extras.join("\n    ")}\n  </head>`);
}

/** The canonical path of a page: lowercase slug, no trailing slash, no query. */
export function canonicalPath(path: BookPath): string {
  return ["/w", path.slug, path.chapter, path.entryId].filter((p): p is string => p !== null).map((p, i) => (i === 0 ? p : encodeURIComponent(p))).join("/");
}

/** `null` for an unknown or closed book (the function answers 404), and for any failure. */
export async function fetchBookMeta(slug: string, supabaseUrl: string | undefined, fetchImpl: Fetch = fetch): Promise<PublicOpenBookMeta | null> {
  if (!supabaseUrl) return null;
  try {
    const res = await fetchImpl(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/open-book/${encodeURIComponent(slug)}?part=meta`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as PublicOpenBookMeta;
    return body?.snapshot?.book && Array.isArray(body.sessions) ? body : null;
  } catch {
    return null;
  }
}

const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
} as const;

/**
 * The page for GET /w/<path>. Fails open: whatever goes wrong after index.html is in hand, the visitor gets
 * that file untouched (and noindex), which is what every route got before this existed.
 */
export async function renderBookPage(req: Request, supabaseUrl: string | undefined, fetchImpl: Fetch = fetch): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const url = new URL(req.url);
  let indexHtml: string;
  try {
    const res = await fetchImpl(`${url.origin}/index.html`, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`index.html ${res.status}`);
    indexHtml = await res.text();
  } catch {
    return new Response("Grimoire is unavailable just now. Please try again in a moment.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const respond = (html: string) => new Response(req.method === "HEAD" ? null : html, { status: 200, headers: PAGE_HEADERS });
  const path = parseBookPath(url.searchParams.get("path"));
  if (!path) return respond(addHeadExtras(indexHtml, null, "noindex"));

  try {
    const meta = await fetchBookMeta(path.slug, supabaseUrl, fetchImpl);
    if (!meta) return respond(addHeadExtras(indexHtml, null, "noindex"));
    const card = chooseCard(path, meta);
    return respond(
      applyTags(indexHtml, {
        title: card.title,
        description: card.description,
        url: `${url.origin}${canonicalPath(path)}`,
        image: `${url.origin}${card.imagePath}`,
        imageAlt: card.imageAlt,
        robots: robotsContent(meta),
      }),
    );
  } catch {
    return respond(addHeadExtras(indexHtml, null, "noindex"));
  }
}
