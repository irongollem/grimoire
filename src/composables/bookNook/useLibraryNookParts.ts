import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { LibraryNookPart } from "@/types/bookNook.types";

/** The shelf of cut-outs and frames, in shelf order: by group, then position within it. */
export async function fetchLibraryNookParts(): Promise<LibraryNookPart[]> {
  const { data, error } = await supabase
    .from("library_nook_parts")
    .select("*")
    .order("group_key", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data as LibraryNookPart[];
}

// Admin-authored content that changes with a release, not a session.
export function useLibraryNookParts() {
  return useQuery({
    queryKey: ["library-nook-parts"] as const,
    queryFn: fetchLibraryNookParts,
    staleTime: 60 * 60 * 1000,
  });
}
