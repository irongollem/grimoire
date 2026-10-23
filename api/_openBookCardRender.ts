// Renders the share card (see open-book-card.ts). Split out so a script can run it against a fixture.
import { readFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";
import type { PublicOpenBookMeta } from "../src/types/openBook.types.js";
import { bookCard, CARD_H, CARD_W, sessionCard, type CardAssets } from "./_openBookCard.js";
import { findSession } from "./_openBookMeta.js";

// Where the fonts and textures come from. They are read from the function's own bundle with `fs`, at paths
// relative to the project root, and vercel.json's `functions["api/open-book-card.ts"].includeFiles` ships
// exactly those files into the bundle (the `public/` files are otherwise served from the CDN only, and
// node_modules/@fontsource is not imported, so the file tracer would never find a path built at runtime).
// Cwd is /var/task on Vercel and the repo root locally, so the same relative paths work in both.
const root = (...parts: string[]) => path.join(process.cwd(), ...parts);
const FONT_FILES = {
  cinzel700: root("node_modules/@fontsource/cinzel/files/cinzel-latin-700-normal.woff"),
  alegreya400i: root("node_modules/@fontsource/alegreya/files/alegreya-latin-400-italic.woff"),
  alegreya700: root("node_modules/@fontsource/alegreya/files/alegreya-latin-700-normal.woff"),
};

let fontsPromise: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" | "italic" }[]> | null = null;
function fonts() {
  fontsPromise ??= Promise.all([readFile(FONT_FILES.cinzel700), readFile(FONT_FILES.alegreya400i), readFile(FONT_FILES.alegreya700)]).then(([c, ai, a7]) => [
    { name: "Cinzel", data: c, weight: 700 as const, style: "normal" as const },
    { name: "Alegreya", data: ai, weight: 400 as const, style: "italic" as const },
    { name: "Alegreya", data: a7, weight: 700 as const, style: "normal" as const },
  ]);
  return fontsPromise;
}

/**
 * Every raster goes to satori as a JPEG or PNG data URI. Satori hands <img> data to the rasteriser inside the
 * SVG, and the bundled textures, the logo and most covers (R2 serves WebP) are WebP, which it cannot be
 * trusted to decode; sharp does it here, once, and also shrinks a cover to the card.
 */
async function toJpegUri(input: Buffer | string): Promise<string> {
  const buf = await sharp(input).resize(CARD_W, CARD_H, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

async function logoUri(file: string): Promise<string> {
  const buf = await sharp(file).resize({ height: 88 }).png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

const MAX_COVER_BYTES = 6_000_000;
const COVER_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** An https image of the DM's choosing, as a data URI. Null on anything off (the card falls back to leather). */
export async function remoteImageUri(raw: string | null, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // The URL is user content. https only, and no bare IPs or local names, so the function cannot be pointed
    // at an internal address.
    if (url.protocol !== "https:" || /^[\d.]+$|^\[|^localhost$|\.(local|internal)$/i.test(url.hostname)) return null;
    const res = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(4_000) });
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!res.ok || !COVER_MIMES.has(mime)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_COVER_BYTES) return null;
    return await toJpegUri(buf);
  } catch {
    return null;
  }
}

/** A session's card is drawn over its own first picture when it has one, else over the book's cover. */
export async function loadAssets(meta: PublicOpenBookMeta, sessionId: string | null = null, fetchImpl: typeof fetch = fetch): Promise<CardAssets> {
  const oxblood = meta.snapshot.book.leather === "oxblood";
  const sessionImage = sessionId ? (meta.sessions.find((s) => s.id === sessionId)?.image ?? null) : null;
  const [leather, cover, logo] = await Promise.all([
    toJpegUri(root("public/assets/open-book", oxblood ? "leather-oxblood.webp" : "leather.webp")),
    remoteImageUri(sessionImage ?? meta.snapshot.book.cover_image_url, fetchImpl),
    logoUri(root("public/brand/logo-dark.webp")).catch(() => null),
  ]);
  return { leather, cover, logo };
}

/**
 * The image for the book, or for one of its sessions: satori lays the element tree out as SVG (text becomes
 * paths, so the rasteriser needs no fonts), sharp rasterises it. A cover image that does not draw is retried
 * without.
 *
 * Why not `@vercel/og`, which wraps exactly this: its Node build (1.0.2) does not start under an ESM function.
 * It reaches for `require` and `__dirname` while loading and then opens an `hb.wasm` that the package does not
 * ship in dist/. satori itself runs fine, and sharp is already in the tree.
 */
export async function renderCard(meta: PublicOpenBookMeta, sessionId: string | null, assets: CardAssets, format: "jpeg" | "png" = "jpeg"): Promise<Buffer> {
  const session = sessionId ? findSession({ slug: "", chapter: "chronicle", entryId: sessionId }, meta) : null;
  const withFonts = await fonts();
  const make = async (a: CardAssets) => {
    const svg = await satori((session ? sessionCard(meta, session, a) : bookCard(meta, a)) as never, { width: CARD_W, height: CARD_H, fonts: withFonts });
    const image = sharp(Buffer.from(svg));
    // JPEG by default: the card is mostly texture, 1.3 MB as PNG and ~250 KB as JPEG, and WhatsApp drops
    // previews whose image is much over 300 KB.
    return (format === "png" ? image.png({ compressionLevel: 9 }) : image.jpeg({ quality: 84, mozjpeg: true })).toBuffer();
  };
  try {
    return await make(assets);
  } catch (err) {
    if (!assets.cover) throw err;
    return make({ ...assets, cover: null });
  }
}
