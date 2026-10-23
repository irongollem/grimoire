import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { endPreview, previewFor } from "@/lib/openBook/preview";
import type { OpenBookPreview, PublicOpenBook } from "@/types/openBook.types";

/** Not a campaign key: a visitor has no campaign, and nothing on the doorbell rings for a public book. */
export const PUBLIC_OPEN_BOOK_KEY = "public-open-book";

export type PublicOpenBookResult = { status: "found"; book: PublicOpenBook } | { status: "not_found" };

export function publicOpenBookUrl(supabaseUrl: string, slug: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/open-book/${encodeURIComponent(slug)}`;
}

/**
 * An anonymous read of the `open-book` Edge Function. A plain `fetch` on purpose: the supabase client would attach
 * the visitor's session, and a public book must not learn who is reading it.
 */
export async function fetchPublicOpenBook(
  slug: string,
  supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL as string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicOpenBookResult> {
  const response = await fetchImpl(publicOpenBookUrl(supabaseUrl, slug), {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "omit",
  });
  if (response.status === 404) return { status: "not_found" };
  if (!response.ok) throw new Error(`The book could not be read (${response.status}).`);
  return { status: "found", book: (await response.json()) as PublicOpenBook };
}

/** Postgres' insufficient_privilege: the preview RPC's refusal of anyone but the owner. */
const REFUSED = "42501";

/**
 * The owner's draft, read through their session and dressed as a release so the reader needs no second path. The
 * number is the next one a release would take. A refusal (signed out, not the owner) ends the preview and returns
 * null, so the caller falls back to the public read.
 */
export async function fetchOpenBookPreview(slug: string, campaignId: string): Promise<PublicOpenBookResult | null> {
  const { data, error } = await supabase.rpc("preview_open_book", { p_campaign_id: campaignId });
  if (error) {
    if (error.code === REFUSED) return null;
    throw error;
  }
  if (!data) return null;
  const { stats, ...snapshot } = data as unknown as OpenBookPreview;
  const { data: latest, error: latestError } = await supabase
    .from("open_book_releases")
    .select("number")
    .eq("campaign_id", campaignId)
    .order("number", { ascending: false })
    .limit(1);
  if (latestError) throw latestError;
  const number = (latest[0]?.number ?? 0) + 1;
  return {
    status: "found",
    book: {
      slug,
      allow_pdf: false,
      indexable: false,
      release: { number, note: null, created_at: new Date().toISOString(), pdf_url: null, stats },
      snapshot,
    },
  };
}

export function usePublicOpenBook(slug: MaybeRefOrGetter<string | null | undefined>) {
  const value = computed(() => toValue(slug) ?? null);
  // The owner's preview reads the draft; everyone else, and the owner without the marker, reads the public release.
  const campaignId = computed(() => previewFor(value.value));
  return useQuery({
    queryKey: computed(() =>
      campaignId.value === null
        ? ([PUBLIC_OPEN_BOOK_KEY, value.value] as const)
        : ([PUBLIC_OPEN_BOOK_KEY, "preview", campaignId.value] as const),
    ),
    queryFn: async (): Promise<PublicOpenBookResult> => {
      const s = value.value;
      if (s === null) throw new Error("usePublicOpenBook fetched without a slug");
      const cid = campaignId.value;
      if (cid !== null) {
        const draft = await fetchOpenBookPreview(s, cid);
        if (draft) return draft;
        endPreview();
      }
      return fetchPublicOpenBook(s);
    },
    enabled: computed(() => value.value !== null),
    staleTime: computed(() => (campaignId.value === null ? 5 * 60 * 1000 : 0)),
    // A preview shows the draft as it is now; coming back to the tab re-reads it.
    refetchOnWindowFocus: computed(() => campaignId.value !== null),
  });
}
