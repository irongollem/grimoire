import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useSharedLocations } from "@/composables/locations/useLocations";
import { useSharedNpcs } from "@/composables/npcs/useNpcs";
import { useItemsByIds } from "@/composables/items/useItemsByIds";

/** One row of `get_player_found_clues`: a clue the party has found. The secret it points at is never in it. */
export interface PlayerFoundClue {
  id: string;
  title: string;
  found_at: string;
  found_session_id: string | null;
  location_id: string | null;
  npc_id: string | null;
  item_id: string | null;
  /** A Scriptorium handout the clue lay in. Named only as "a handout": the player reads it through their own handouts. */
  document_id: string | null;
}

/** A found clue with where it lay, named only when this player may see that record. */
export interface FoundClueRow {
  clue: PlayerFoundClue;
  /** Where it lay, with the record's name; null when it is nowhere in particular or not one the player can see. */
  where: { kind: "place" | "person" | "item" | "handout"; name: string } | null;
}

/** Newest first, the way the party found them. */
export function newestFirst(clues: readonly PlayerFoundClue[]): PlayerFoundClue[] {
  return [...clues].sort((a, b) => b.found_at.localeCompare(a.found_at));
}

/**
 * The clues the party has found, newest first, each with where it lay when the player can see that place, person or
 * item (their own projections, so a hidden record is never named). Rings under the canon root.
 */
export function usePlayerFoundClues() {
  const campaign = useCampaignStore();
  const clues = useQuery({
    queryKey: computed(() => [CANON_KEY, "player-found-clues", campaign.activeCampaignId] as const),
    queryFn: async ({ queryKey: [, , cid] }): Promise<PlayerFoundClue[]> => {
      if (!cid) throw new Error("usePlayerFoundClues fetched without a campaign");
      const { data, error } = await supabase.rpc("get_player_found_clues", { p_campaign_id: cid });
      if (error) throw error;
      return data as PlayerFoundClue[];
    },
    enabled: () => !!campaign.activeCampaignId,
  });
  const { data: places } = useSharedLocations();
  const { data: people } = useSharedNpcs();
  const { data: items } = useItemsByIds(() => (clues.data.value ?? []).map((c) => c.item_id));

  const rows = computed<FoundClueRow[]>(() => {
    const placeName = new Map((places.value ?? []).map((p) => [p.id, p.name]));
    // A person whose name is not the player's to read comes back null: not named.
    const personName = new Map((people.value ?? []).flatMap((n) => (n.name === null ? [] : [[n.id, n.name] as const])));
    return newestFirst(clues.data.value ?? []).map((clue): FoundClueRow => {
      const place = clue.location_id === null ? undefined : placeName.get(clue.location_id);
      const person = clue.npc_id === null ? undefined : personName.get(clue.npc_id);
      const item = clue.item_id === null ? undefined : items.value.get(clue.item_id)?.name;
      if (place !== undefined) return { clue, where: { kind: "place", name: place } };
      if (person !== undefined) return { clue, where: { kind: "person", name: person } };
      if (item !== undefined) return { clue, where: { kind: "item", name: item } };
      if (clue.document_id !== null) return { clue, where: { kind: "handout", name: "a handout" } };
      return { clue, where: null };
    });
  });

  return { rows, isLoading: clues.isLoading, error: clues.error };
}
