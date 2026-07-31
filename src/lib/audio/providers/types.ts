// Sound-provider adapter contract.
//
// The soundboard browses third-party libraries for one-shot effects and beds.
// Freesound is the first, but it must not be the only one the code knows about:
// provider terms change, APIs get deprecated, and commercial-use questions can
// land badly. Swapping a provider should be adding one adapter and removing
// another, not surgery on the browser UI.
//
// Everything provider-specific — endpoint shape, licence vocabulary, attribution
// wording, preview-URL quirks — lives behind this interface. The UI only ever
// sees `ProviderHit`.

import type { SoundCategory, SoundSourceType } from "@/types/sound.types";

/**
 * A licence we are willing to surface, normalised across providers.
 *
 * Deliberately narrow. `public-domain` needs no credit; `attribution` does.
 * Anything a provider offers that does not map onto one of these (non-commercial,
 * no-derivatives, unclear provenance) must be filtered out by the adapter rather
 * than represented here — if we cannot describe the obligation, we cannot honour
 * it, and a commercial product should not be guessing.
 */
export type ProviderLicense = "public-domain" | "attribution";

/** One search result, normalised. */
export interface ProviderHit {
  /** Unique within a provider; combine with `providerId` for global identity. */
  id: string;
  providerId: string;
  name: string;
  /** Uploader/creator display name, for attribution and for the UI. */
  author: string;
  license: ProviderLicense;
  /** Directly playable audio URL. */
  audioUrl: string;
  /** Seconds. 0 when the provider does not report it. */
  duration: number;
  tags: string[];
  /** Human-facing page for the asset, used as the attribution link. */
  pageUrl: string;
  /** Prebuilt credit line, or null when the licence requires none. */
  attribution: string | null;
  attributionUrl: string | null;
  /**
   * True only when the source states the file is authored to loop seamlessly.
   *
   * Length cannot stand in for this — a forty-second field recording is long
   * enough to use as a bed and will still click every time it wraps — so a
   * provider that does not report it says false rather than guessing.
   */
  isLoopable: boolean;
  /**
   * Catalogue entry id when the hit came from our own library, else null.
   *
   * Carried through to `sounds.library_id`, which is what exempts the row from
   * the free tier's cap and keeps the shared file safe from a per-board delete.
   */
  libraryId: string | null;
  /** Which mixer bus the provider thinks this belongs on, when it has a view. */
  category: SoundCategory | null;
}

export interface ProviderSearchResult {
  hits: ProviderHit[];
  page: number;
  hasNext: boolean;
  /** Total matches when the provider reports one. */
  total: number | null;
}

/**
 * Sort orders every provider can honour.
 *
 * Deliberately the intersection rather than the union. Freesound also offers
 * newest/downloads/rating, but a control that changes meaning — or silently
 * does nothing — depending on which tab you are on is worse than a smaller
 * control that always works.
 */
export type ProviderSortKey = "relevance" | "shortest" | "longest";

export const PROVIDER_SORTS: readonly { value: ProviderSortKey; label: string }[] = [
  { value: "relevance", label: "Best match" },
  { value: "shortest", label: "Shortest first" },
  { value: "longest", label: "Longest first" },
];

/**
 * Narrowing filters. Nulls mean "unset", which is distinct from zero — a
 * maximum of 0 seconds would match nothing, so it cannot be the default.
 */
export interface ProviderFilters {
  minDuration: number | null;
  maxDuration: number | null;
  sort: ProviderSortKey;
}

export const DEFAULT_PROVIDER_FILTERS: ProviderFilters = {
  minDuration: null,
  maxDuration: null,
  sort: "relevance",
};

export interface ProviderSearchParams {
  query: string;
  page: number;
  filters: ProviderFilters;
}

export interface SoundProvider {
  /** Stable key, persisted on rows via `sounds.source_type`-adjacent metadata. */
  readonly id: string;
  /**
   * What a sound added from here is recorded as on `sounds.source_type`.
   *
   * Declared by the adapter so the browser never has to name a provider to
   * decide what it just added — adding a third source should not mean editing
   * a conditional in the UI.
   */
  readonly sourceType: SoundSourceType;
  /** Shown on the browser tab. */
  readonly label: string;
  /** Where the audio comes from, for the UI to credit honestly. */
  readonly attributionNote: string;
  /** Shortest query worth sending. */
  readonly minQueryLength: number;
  search(params: ProviderSearchParams): Promise<ProviderSearchResult>;
}
