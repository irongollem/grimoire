// Shared CORS helper.
//
// Instead of a blanket `Access-Control-Allow-Origin: *`, reflect the request's
// Origin only when it's in the allowlist (production app + local dev origins).
// Unknown/missing origins fall back to the production origin so the headers are
// always well-formed but never permissively echo an arbitrary caller.

// The app lives on the app subdomain after the marketing split. The apex
// (dungeongrimoire.com) is kept allowed so the app keeps working during the
// transition — pre-cutover the app is still served from the apex, and these
// edge functions are a single shared deployment that must accept both.
const APP_ORIGIN = "https://app.dungeongrimoire.com";
const APEX_ORIGIN = "https://dungeongrimoire.com";

const ALLOWED_ORIGINS = new Set<string>([
  APP_ORIGIN,
  APEX_ORIGIN,
  "http://localhost:5173",
  "http://localhost:4173", // vite preview
  "http://127.0.0.1:5173",
]);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}
