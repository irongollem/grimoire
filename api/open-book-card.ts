// GET /api/open-book-card?slug=&session= — the 1200x630 (JPEG) share card of a public Open Book or one of its
// sessions (og:image of the pages api/open-book-page.ts serves). Drawing: _openBookCard.ts; rendering and where
// the fonts and textures come from: _openBookCardRender.ts.
import { loadAssets, renderCard } from "./_openBookCardRender.js"; // .js: package.json is "type": "module", so Node needs the extension at runtime
import { fetchBookMeta, parseBookPath } from "./_openBookMeta.js";

const supabaseUrl = (): string | undefined => process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;

/** The generic card, for a book that is closed or unknown or a render that failed: never a broken image. */
function fallback(): Response {
  return Response.redirect("https://dungeongrimoire.com/og.png", 302);
}

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const slug = parseBookPath(params.get("slug"))?.slug;
  if (!slug) return fallback();
  try {
    const meta = await fetchBookMeta(slug, supabaseUrl());
    if (!meta) return fallback();
    const assets = await loadAssets(meta, params.get("session"));
    // The page puts the release number in `v`, so a new release is a new URL and the day-long cache is safe.
    const png = await renderCard(meta, params.get("session"), assets);
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch {
    return fallback();
  }
}
