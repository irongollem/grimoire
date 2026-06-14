// Shared CORS helper.
//
// Instead of a blanket `Access-Control-Allow-Origin: *`, reflect the request's
// Origin only when it's in the allowlist (production app + local dev origins).
// Unknown/missing origins fall back to the production origin so the headers are
// always well-formed but never permissively echo an arbitrary caller.

const PROD_ORIGIN = "https://dungeongrimoire.com";

const ALLOWED_ORIGINS = new Set<string>([
  PROD_ORIGIN,
  "http://localhost:5173",
  "http://localhost:4173", // vite preview
  "http://127.0.0.1:5173",
]);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : PROD_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}
