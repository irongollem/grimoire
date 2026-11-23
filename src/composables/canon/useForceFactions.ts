import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { CONNECTIONS_KEY } from "@/lib/campaignLiveSync/registry";
import { forceWhoNames } from "@/lib/canon/canonForces";
import { useAllFactions } from "@/composables/factions/useFactions";

/**
 * Which faction is behind each force (#1258 item 16): the campaign's `about` links from a force to a faction, read once
 * for every force, joined to the faction list so a renamed faction reads under its new name. It sits under the
 * connections root, which a `world_links` write rings and the connection writers refresh.
 */
async function fetchForceFactionLinks(campaignId: string): Promise<{ force_id: string; faction_id: string }[]> {
  const { data, error } = await supabase
    .from("world_links")
    .select("from_id, to_id")
    .eq("campaign_id", campaignId)
    .eq("from_kind", "canon")
    .eq("to_kind", "faction")
    .eq("type", "about")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((row) => ({ force_id: row.from_id, faction_id: row.to_id }));
}

export function useForceFactions() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const { data: links } = useQuery({
    queryKey: computed(() => [CONNECTIONS_KEY, "force-factions", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useForceFactions fetched without a campaign");
      return fetchForceFactionLinks(cid);
    },
    enabled: computed(() => !!campaignId.value),
  });
  const { data: factions } = useAllFactions();
  const who = computed(() => forceWhoNames(links.value ?? [], factions.value ?? []));
  return {
    /** The faction behind a force, or null when none is. */
    factionOf: (forceId: string) => who.value.get(forceId) ?? null,
    /** The faction's current name, or null. */
    whoOf: (forceId: string) => who.value.get(forceId)?.name ?? null,
  };
}
