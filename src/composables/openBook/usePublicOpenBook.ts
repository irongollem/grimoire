import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import type { PublicOpenBook } from "@/types/openBook.types";

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

export function usePublicOpenBook(slug: MaybeRefOrGetter<string | null | undefined>) {
  const value = computed(() => toValue(slug) ?? null);
  return useQuery({
    queryKey: computed(() => [PUBLIC_OPEN_BOOK_KEY, value.value] as const),
    queryFn: ({ queryKey: [, s] }): Promise<PublicOpenBookResult> => {
      if (s === null) throw new Error("usePublicOpenBook fetched without a slug");
      return fetchPublicOpenBook(s);
    },
    enabled: computed(() => value.value !== null),
    staleTime: 5 * 60 * 1000,
  });
}
