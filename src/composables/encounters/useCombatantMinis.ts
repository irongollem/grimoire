import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { combatantPortraitOverrides, type MiniPortraitRow } from "@/lib/battlemap/combatantMiniPortraits";
import type { RunCombatant } from "@/types/encounter.types";

async function fetchVttMinis(campaignId: string): Promise<MiniPortraitRow[]> {
  const { data, error } = await supabase
    .from("minis")
    .select("source_table, source_id, format, status, thumbnail_url, stylized_image_url, created_at")
    .eq("campaign_id", campaignId)
    .eq("format", "vtt")
    .eq("status", "ready");
  if (error) throw error;
  return data as MiniPortraitRow[];
}

/**
 * Frame 13: "A `minis` row with `format:'vtt'` is the portrait; the faction
 * supplies the ring." Batches the mini lookup for every combatant on the
 * battle map into one query instead of one `useMiniForSource` per token, and
 * returns instance_id -> portrait URL for the ones that have a ready vtt
 * mini (see `combatantPortraitOverrides` for the source/newest-wins rules).
 *
 * Reads the `minis` table directly — the DM-side path the token forge
 * gallery (`useMinis`) already uses — rather than `get_player_visible_mini`:
 * this feeds the DM's own battle map view, which is DM-only, so the
 * player-visibility gate that RPC applies doesn't belong here.
 */
export function useCombatantMinis(combatants: MaybeRefOrGetter<RunCombatant[]>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);

  const { data: minis } = useQuery({
    queryKey: computed(() => ["minis", "vtt-ready", campaignId.value]),
    queryFn: () => fetchVttMinis(campaignId.value!),
    enabled: () => !!campaignId.value,
    staleTime: 60_000,
  });

  return computed(() => combatantPortraitOverrides(toValue(combatants), minis.value ?? []));
}
