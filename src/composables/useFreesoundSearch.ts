import { computed, type Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { FreesoundLicense } from "@/lib/freesound";

export interface FreesoundHit {
  id: number;
  name: string;
  username: string;
  license: FreesoundLicense;
  preview_url: string;
  duration: number;
  tags: string[];
  page_url: string;
  attribution: string | null;
  attribution_url: string | null;
}

export interface FreesoundSearchResult {
  count: number;
  results: FreesoundHit[];
  page: number;
  page_size: number;
  has_next: boolean;
}

const MIN_QUERY_LENGTH = 2;

async function searchFreesound(query: string, page: number): Promise<FreesoundSearchResult> {
  const params = new URLSearchParams({ q: query, page: String(page) });
  const { data, error } = await supabase.functions.invoke<FreesoundSearchResult>(
    `freesound-search?${params}`,
    { method: "GET" },
  );
  if (error) throw error;
  if (!data) throw new Error("Empty response from freesound-search");
  return data;
}

export function useFreesoundSearch(query: Ref<string>, page: Ref<number>) {
  return useQuery({
    queryKey: computed(() => ["freesound-search", query.value.trim().toLowerCase(), page.value]),
    queryFn: () => searchFreesound(query.value.trim(), page.value),
    enabled: computed(() => query.value.trim().length >= MIN_QUERY_LENGTH),
    staleTime: 1000 * 60 * 10,
    placeholderData: (prev) => prev,
  });
}
