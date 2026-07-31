// Pure helpers for Freesound API responses.
//
// NOTE: The edge function at `supabase/functions/freesound-search/index.ts`
// inlines duplicates of `normalizeLicense` and `buildAttribution`. They run in
// Deno and can't directly import this file. Keep the two copies in sync.

export type FreesoundLicense = "cc0" | "cc-by";

/**
 * Map Freesound's free-form license string onto our normalised enum, or
 * `null` if the license is one we don't accept (e.g. CC-BY-NC).
 *
 * Freesound returns license URLs (e.g. http://creativecommons.org/publicdomain/zero/1.0/)
 * in API responses but accepts friendly names ("Creative Commons 0", "Attribution")
 * in the filter parameter. We handle both forms so this helper is symmetric.
 */
export function normalizeLicense(raw: string): FreesoundLicense | null {
  const lc = raw.toLowerCase();
  // Reject CC-BY-NC explicitly (URL form contains "by-nc", friendly contains "noncommercial").
  if (lc.includes("by-nc") || lc.includes("noncommercial")) return null;
  // CC0: friendly "Creative Commons 0" / "CC0", URL contains "publicdomain/zero".
  if (lc.includes("creative commons 0") || lc.includes("cc0") || lc.includes("publicdomain/zero")) {
    return "cc0";
  }
  // CC-BY: friendly "Attribution", URL contains "/licenses/by/".
  if (lc.includes("attribution") || lc.includes("/licenses/by/")) return "cc-by";
  return null;
}

export interface AttributionInput {
  name: string;
  username: string;
  url: string;
}

export interface AttributionOutput {
  attribution: string | null;
  attribution_url: string | null;
}

/**
 * Build the attribution string + link for a sound. CC0 needs no credit, CC-BY
 * does. We only credit when the license requires it — Freesound contributors
 * who picked CC0 explicitly didn't ask to be credited.
 */
export function buildAttribution(hit: AttributionInput, license: FreesoundLicense): AttributionOutput {
  if (license === "cc0") {
    return { attribution: null, attribution_url: null };
  }
  return {
    attribution: `"${hit.name}" by ${hit.username} on Freesound (CC-BY)`,
    attribution_url: hit.url,
  };
}

/**
 * Freesound's API returns preview URLs at `freesound.org/data/previews/...`
 * which 302-redirect to `cdn.freesound.org/previews/...`. Rewriting to the
 * CDN host directly saves one round-trip per play.
 */
export function rewriteToCdn(previewUrl: string): string {
  return previewUrl.replace(
    /^https?:\/\/freesound\.org\/data\/previews\//,
    "https://cdn.freesound.org/previews/",
  );
}
