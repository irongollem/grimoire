// SSRF guard for server-side fetches of client-supplied image URLs.
//
// These functions fetch reference portraits/images by URL provided in the
// request body and pass them on to an image provider. A URL must therefore
// ONLY ever point at our own Supabase Storage public objects — never an
// arbitrary host (which would let a caller probe internal services / metadata
// endpoints) and never a private/link-local address.
//
// Allowed shape: `${SUPABASE_URL}/storage/v1/object/public/...` over https,
// same origin as the project's SUPABASE_URL.

const STORAGE_PUBLIC_PREFIX = "/storage/v1/object/public/";

// Private / link-local / loopback literals — defense in depth in case the
// project origin host ever resolves to one of these (it shouldn't).
function isPrivateHostLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase(); // strip IPv6 brackets

  // IPv6 loopback / unique-local (fc00::/7 → starts fc or fd).
  if (h === "::1") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("fe80")) return true; // link-local IPv6

  // IPv4 dotted-quad ranges.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 127) return true;                          // 127.0.0.0/8 loopback
  if (a === 10) return true;                           // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16 link-local
  return false;
}

/**
 * Returns true if `url` is a safe Supabase Storage public URL for this project.
 * Use `assertSafeStorageUrl` when you want to throw instead.
 */
export function isSafeStorageUrl(url: string): boolean {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) return false;

  let parsed: URL;
  let projectOrigin: string;
  try {
    parsed = new URL(url);
    projectOrigin = new URL(supabaseUrl).origin;
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (parsed.origin !== projectOrigin) return false;
  if (!parsed.pathname.startsWith(STORAGE_PUBLIC_PREFIX)) return false;
  if (isPrivateHostLiteral(parsed.hostname)) return false;

  return true;
}

/**
 * Throws if `url` is not a safe Supabase Storage public URL for this project.
 * Throw site is intentionally before any fetch() of the URL.
 */
export function assertSafeStorageUrl(url: string): void {
  if (!isSafeStorageUrl(url)) {
    throw new Error("Unsafe or non-storage image URL rejected");
  }
}
