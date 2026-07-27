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
}

export interface ProviderSearchResult {
  hits: ProviderHit[];
  page: number;
  hasNext: boolean;
  /** Total matches when the provider reports one. */
  total: number | null;
}

export interface ProviderSearchParams {
  query: string;
  page: number;
}

export interface SoundProvider {
  /** Stable key, persisted on rows via `sounds.source_type`-adjacent metadata. */
  readonly id: string;
  /** Shown on the browser tab. */
  readonly label: string;
  /** Where the audio comes from, for the UI to credit honestly. */
  readonly attributionNote: string;
  /** Shortest query worth sending. */
  readonly minQueryLength: number;
  search(params: ProviderSearchParams): Promise<ProviderSearchResult>;
}
