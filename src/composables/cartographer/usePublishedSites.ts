// Which Atlas locations a Cartographer drawing has been published to (#868).
//
// One map may back several places — a reused gatehouse is one drawing
// published twice — so this is a list keyed on `source_map_id`, never a
// single row. Feeds the editor's "Published to" rail panel and the status
// bar's "N regions changed since last publish" caution (that caution only
// makes sense once a map has been published at least once).

import { useQuery } from "@tanstack/vue-query";
import { computed, isRef, ref, type Ref } from "vue";
import { supabase } from "@/lib/supabase";
import type { LocationType } from "@/types/location.types";

export interface PublishedSite {
  id: string;
  name: string;
  location_type: LocationType;
  map_published_rev: number | null;
  updated_at: string;
}

export function usePublishedSites(mapId: string | Ref<string>) {
  const idRef = isRef(mapId) ? mapId : ref(mapId);
  return useQuery({
    queryKey: computed(() => ["published-sites", idRef.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, location_type, map_published_rev, updated_at")
        .eq("source_map_id", idRef.value);
      if (error) throw error;
      return data as PublishedSite[];
    },
    enabled: () => !!idRef.value,
  });
}
