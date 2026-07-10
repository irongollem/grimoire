import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders as makeCors } from "../_shared/cors.ts";

// Only CC0 + CC-BY. CC-BY-NC is excluded because Grimoire is a commercial product
// (Pro tier), and we want to respect contributor intent regardless of free-tier
// arguments. See: feedback_licensing_spirit.md
const LICENSE_FILTER = 'license:("Creative Commons 0" OR "Attribution")';

const FIELDS = ["id", "name", "username", "license", "previews", "duration", "tags", "url"].join(",");

interface FreesoundResult {
  id: number;
  name: string;
  username: string;
  license: string;
  previews: {
    "preview-hq-mp3": string;
    "preview-lq-mp3": string;
    "preview-hq-ogg": string;
    "preview-lq-ogg": string;
  };
  duration: number;
  tags: string[];
  url: string;
}

interface FreesoundSearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: FreesoundResult[];
}

export interface TrimmedHit {
  id: number;
  name: string;
  username: string;
  license: "cc0" | "cc-by";
  preview_url: string;
  duration: number;
  tags: string[];
  page_url: string;
  attribution: string | null;
  attribution_url: string | null;
}

// Mirror of normalizeLicense in src/lib/freesound.ts — keep in sync.
// Freesound returns license URLs (e.g. http://creativecommons.org/publicdomain/zero/1.0/)
// in API responses but accepts friendly names in the filter parameter.
export function normalizeLicense(raw: string): "cc0" | "cc-by" | null {
  const lc = raw.toLowerCase();
  if (lc.includes("by-nc") || lc.includes("noncommercial")) return null;
  if (lc.includes("creative commons 0") || lc.includes("cc0") || lc.includes("publicdomain/zero")) {
    return "cc0";
  }
  if (lc.includes("attribution") || lc.includes("/licenses/by/")) return "cc-by";
  return null;
}

export function buildAttribution(
  hit: Pick<FreesoundResult, "name" | "username" | "url">,
  license: "cc0" | "cc-by",
): Pick<TrimmedHit, "attribution" | "attribution_url"> {
  if (license === "cc0") {
    return { attribution: null, attribution_url: null };
  }
  return {
    attribution: `"${hit.name}" by ${hit.username} on Freesound (CC-BY)`,
    attribution_url: hit.url,
  };
}

// Mirror of rewriteToCdn in src/lib/freesound.ts — keep in sync.
// Freesound's preview URLs at freesound.org/data/previews/... 302-redirect to
// cdn.freesound.org/previews/... — saving the CDN URL skips a round trip on
// every play.
function rewriteToCdn(previewUrl: string): string {
  return previewUrl.replace(
    /^https?:\/\/freesound\.org\/data\/previews\//,
    "https://cdn.freesound.org/previews/",
  );
}

export function trimHit(hit: FreesoundResult): TrimmedHit | null {
  const license = normalizeLicense(hit.license);
  if (!license) return null; // belt-and-braces — license filter should already exclude these
  return {
    id: hit.id,
    name: hit.name,
    username: hit.username,
    license,
    preview_url: rewriteToCdn(hit.previews["preview-hq-mp3"]),
    duration: hit.duration,
    tags: hit.tags,
    page_url: hit.url,
    ...buildAttribution(hit, license),
  };
}

serve(async (req: Request) => {
  // Origin-allowlisted CORS (shared helper) instead of a wildcard.
  const corsHeaders = makeCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(48, Math.max(1, Number(url.searchParams.get("page_size") ?? "24") || 24));

  if (!q) {
    return new Response(
      JSON.stringify({ count: 0, results: [], page, page_size: pageSize }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const apiKey = Deno.env.get("FREESOUND_API_KEY");
  if (!apiKey) {
    return new Response("FREESOUND_API_KEY not configured", { status: 500, headers: corsHeaders });
  }

  const params = new URLSearchParams({
    query: q,
    filter: LICENSE_FILTER,
    fields: FIELDS,
    page: String(page),
    page_size: String(pageSize),
  });

  const fsRes = await fetch(`https://freesound.org/apiv2/search/text/?${params}`, {
    headers: { Authorization: `Token ${apiKey}` },
  });

  if (!fsRes.ok) {
    const body = await fsRes.text().catch(() => "");
    console.error(`Freesound error ${fsRes.status}:`, body.slice(0, 500));
    return new Response(
      JSON.stringify({ error: "Sound search failed" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const data = await fsRes.json() as FreesoundSearchResponse;
  const results = data.results.map(trimHit).filter((h): h is TrimmedHit => h !== null);

  return new Response(
    JSON.stringify({
      count: data.count,
      results,
      page,
      page_size: pageSize,
      has_next: !!data.next,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
