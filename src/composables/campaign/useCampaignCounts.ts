import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

/**
 * How many NPCs, encounters and places the campaign holds, for the dashboard's
 * stats strip (#999). The strip only prints a number, so it asks the database to
 * count (`head: true` returns no rows) instead of loading three lists to take
 * their `length`.
 *
 * Each count lives under its table's own query root (`["npcs", "count", cid]`),
 * so every mutation that invalidates the table's root refreshes it, and so does
 * the table's ring on another client (the doorbell refreshes the whole root).
 */
async function countRows(
  table: "npcs" | "encounters",
  campaignId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (error) throw error;
  if (count === null) throw new Error(`Counting ${table} returned no count`);
  return count;
}

/** Places include the global ones (`campaign_id` null), like the Atlas's own list. */
async function countLocations(campaignId: string): Promise<number> {
  const { count, error } = await supabase
    .from("locations")
    .select("id", { count: "exact", head: true })
    .or(`campaign_id.eq.${campaignId},campaign_id.is.null`);
  if (error) throw error;
  if (count === null) throw new Error("Counting locations returned no count");
  return count;
}

export function useCampaignCounts() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const enabled = () => !!campaignId.value;

  const npcs = useQuery({
    queryKey: computed(() => ["npcs", "count", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (!cid) throw new Error("npc count read without a campaign");
      return countRows("npcs", cid);
    },
    enabled,
  });
  const encounters = useQuery({
    queryKey: computed(() => ["encounters", "count", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (!cid) throw new Error("encounter count read without a campaign");
      return countRows("encounters", cid);
    },
    enabled,
  });
  const locations = useQuery({
    queryKey: computed(() => ["locations", "count", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (!cid) throw new Error("location count read without a campaign");
      return countLocations(cid);
    },
    enabled,
  });

  return { npcs, encounters, locations };
}
