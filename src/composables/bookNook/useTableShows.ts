import { computed } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { TableShows } from "@/types/bookNook.types";

export async function writeTableShows(campaignId: string, value: TableShows): Promise<TableShows> {
  const { data, error } = await supabase
    .from("campaigns")
    .update({ table_shows: value })
    .eq("id", campaignId)
    .select("table_shows")
    .single();
  if (error) throw error;
  return (data as { table_shows: TableShows }).table_shows;
}

/** What the Table screen shows while no fight runs, read from the active campaign row. */
export function useTableShows() {
  const store = useCampaignStore();
  const queryClient = useQueryClient();
  const tableShows = computed<TableShows | null>(() => store.activeCampaign?.table_shows ?? null);
  const mutation = useMutation({
    mutationFn: (value: TableShows) => {
      const id = store.activeCampaignId;
      if (!id) throw new Error("table_shows set without an active campaign");
      return writeTableShows(id, value);
    },
    onSuccess: (value) => {
      // The store holds the row the screens read, so it moves with the write rather than waiting for a refetch.
      if (store.activeCampaign) store.activeCampaign = { ...store.activeCampaign, table_shows: value };
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
  return { tableShows, setTableShows: mutation.mutateAsync, isSaving: mutation.isPending };
}
