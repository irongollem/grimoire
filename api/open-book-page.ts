// GET /w/* — the Open Book reader's HTML, with the book's own share tags. Why this is a function and not the
// SPA rewrite: _openBookMeta.ts. vercel.json routes /w/:path* here ahead of the catch-all rewrite.
import { renderBookPage } from "./_openBookMeta.js"; // .js: package.json is "type": "module", so Node needs the extension at runtime

const supabaseUrl = (): string | undefined => process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;

export function GET(req: Request): Promise<Response> {
  return renderBookPage(req, supabaseUrl());
}

export function HEAD(req: Request): Promise<Response> {
  return renderBookPage(req, supabaseUrl());
}
