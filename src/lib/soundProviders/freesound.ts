// Freesound adapter.
//
// Wraps the existing `freesound-search` edge function and normalises its
// response onto the shared `ProviderHit` shape. All Freesound-specific
// knowledge — licence vocabulary, attribution wording, the preview-URL CDN
// rewrite — stays in here.

import { supabase } from "@/lib/supabase";
import { rewriteToCdn } from "@/lib/freesound";
import type {
  SoundProvider,
  ProviderHit,
  ProviderSearchParams,
  ProviderSearchResult,
} from "./types";

export const FREESOUND_PROVIDER_ID = "freesound";

/** Shape returned by the edge function. */
interface FreesoundApiHit {
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

interface FreesoundApiResult {
  count: number;
  results: FreesoundApiHit[];
  page: number;
  page_size: number;
  has_next: boolean;
}

function toHit(raw: FreesoundApiHit): ProviderHit {
  return {
    id: String(raw.id),
    providerId: FREESOUND_PROVIDER_ID,
    name: raw.name,
    author: raw.username,
    // The edge function already rejects anything outside CC0 / CC-BY, so these
    // are the only two that reach us.
    license: raw.license === "cc0" ? "public-domain" : "attribution",
    audioUrl: rewriteToCdn(raw.preview_url),
    duration: raw.duration,
    tags: raw.tags,
    pageUrl: raw.page_url,
    attribution: raw.attribution,
    attributionUrl: raw.attribution_url,
    // Freesound does not report whether a clip is authored to loop, and length
    // is not a substitute — so we say we do not know rather than guess.
    isLoopable: false,
    libraryId: null,
    // Nor does it classify onto a mixer bus; the add flow picks the default.
    category: null,
  };
}

export const freesoundProvider: SoundProvider = {
  id: FREESOUND_PROVIDER_ID,
  sourceType: "freesound",
  label: "Freesound",
  attributionNote: "Creative Commons sounds from Freesound. Credit is kept with the sound.",
  minQueryLength: 2,

  async search({ query, page, filters }: ProviderSearchParams): Promise<ProviderSearchResult> {
    const params = new URLSearchParams({ q: query, page: String(page), sort: filters.sort });
    // Only sent when set — an unset bound must not become a zero-second one.
    if (filters.minDuration !== null) params.set("min_duration", String(filters.minDuration));
    if (filters.maxDuration !== null) params.set("max_duration", String(filters.maxDuration));
    const { data, error } = await supabase.functions.invoke<FreesoundApiResult>(
      `freesound-search?${params}`,
      { method: "GET" },
    );
    if (error) throw error;
    if (!data) throw new Error("Empty response from freesound-search");

    return {
      hits: data.results.map(toHit),
      page: data.page,
      hasNext: data.has_next,
      total: data.count,
    };
  },
};
