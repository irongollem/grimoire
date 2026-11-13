import { ASSET_CDN_BASE } from "@/lib/storage/buckets";
import artManifestJson from "@/generated/artManifest.json";
import { ART_PREFIX } from "@/lib/assets/artPrefix";

/*
 * Rewrites every root-relative asset reference in the book's HTML, `url(/…)`
 * in its CSS and `src="/…"` on its elements, into a base64 `data:` URI.
 *
 * The PDF is printed by a browser on Cloudflare (render-pdf, #565) that cannot
 * reach the app's origin, so anything the document loads from `/fonts/…` or
 * `/assets/…` has to travel inside the HTML. Fonts were the first case: one it
 * had to fetch would silently fall back to Georgia. The parchment page
 * background (`/assets/scriptorium/page-paper.webp`, pagedPreviewCss.ts)
 * was the second: without a CDN mapping it stays a bare path, and every page
 * would print plain. One pass over the whole document covers both and any
 * later one, rather than a list of known files.
 *
 * The papers (#1181) are the third case: in production they are served from
 * the art CDN, so a book's `style` attribute names a CDN URL, which is
 * inlined like a root-relative path, and so are the dressing's mask pictures. Only app art on the CDN: a user's
 * picture there is left as it is. Protocol-relative (`//host/…`), other
 * absolute (`https:`) and `data:` references are left alone: the renderer can
 * load the first two itself.
 */

const MIME_BY_EXTENSION: Record<string, string> = {
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
};

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The CDN URLs of the app's own art (the build's art manifest, inverted the way `artUrl()` maps a path to the CDN).
 * The CDN also serves users' pictures and bakes: those are never inlined, or one swept file would fail the export
 * and a book of paintings would outgrow the render request.
 */
const CDN_ART_URLS: ReadonlySet<string> = new Set(
  ASSET_CDN_BASE ? Object.values(artManifestJson as Record<string, string>).map((key) => `${ASSET_CDN_BASE}/${key}`) : [],
);
/** A CDN URL under the art prefix; whether it is really app art is decided by CDN_ART_URLS. */
const CDN_ART = ASSET_CDN_BASE ? `${escapeRe(ASSET_CDN_BASE)}\\/${escapeRe(ART_PREFIX)}\\/` : null;

/** url("/x"), url('/x') and url(/x), and the same for an app-art CDN URL (the papers, the dressing's masks). */
const CSS_URL = new RegExp(`url\\(\\s*(["']?)((?:\\/(?!\\/)|${CDN_ART ?? "(?!)"})[^"')\\s]+)\\1\\s*\\)`, "g");
/** src="/x" and src='/x' on an element, never src="//host/x" and never a CDN url (that is a user's picture). */
const SRC_ATTR = /(\ssrc=)(["'])(\/(?!\/)[^"']+)\2/g;

export const ASSETS_LOAD_ERROR = "Could not load the book's fonts or page art.";

function mimeFor(path: string): string | null {
  const ext = path.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  return ext ? (MIME_BY_EXTENSION[ext] ?? null) : null;
}

/** A root-relative path, or a CDN url that is app art. */
function isInlinable(path: string): boolean {
  return path.startsWith("/") || CDN_ART_URLS.has(path);
}

/** Chunked so String.fromCharCode never exceeds the argument limit. */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Inline every root-relative reference of a known type. `fetchAsset` loads a
 * path from the app's origin; any failure fails the whole call with
 * ASSETS_LOAD_ERROR, because a book in the wrong font or without its pages'
 * art is the failure this exists to prevent. A reference of an unknown type
 * is left as it is.
 */
export async function inlineSameOriginAssets(
  html: string,
  fetchAsset: (path: string) => Promise<ArrayBuffer>,
): Promise<string> {
  const paths = new Set<string>();
  for (const m of html.matchAll(CSS_URL)) if (mimeFor(m[2]) && isInlinable(m[2])) paths.add(m[2]);
  for (const m of html.matchAll(SRC_ATTR)) if (mimeFor(m[3])) paths.add(m[3]);

  const uris = new Map<string, string>();
  try {
    await Promise.all(
      [...paths].map(async (path) => {
        uris.set(path, `data:${mimeFor(path)};base64,${toBase64(await fetchAsset(path))}`);
      }),
    );
  } catch {
    throw new Error(ASSETS_LOAD_ERROR);
  }

  return html
    .replace(CSS_URL, (whole, _quote: string, path: string) => {
      const uri = uris.get(path);
      // Unquoted: the URL may sit inside a double-quoted `style` attribute, and a base64 data URI has nothing to quote.
      return uri ? `url(${uri})` : whole;
    })
    .replace(SRC_ATTR, (whole, attr: string, quote: string, path: string) => {
      const uri = uris.get(path);
      return uri ? `${attr}${quote}${uri}${quote}` : whole;
    });
}
