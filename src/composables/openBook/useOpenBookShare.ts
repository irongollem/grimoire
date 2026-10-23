import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { chunkArray } from "@/lib/utils";
import { OPEN_BOOK_KEY } from "@/lib/campaignLiveSync/registry";
import { fieldsForFirstReveal } from "@/lib/npcDisplay";
import type { OpenBookEntityType } from "@/types/openBook.types";

/** An `in (...)` id list rides the URL, so a share goes out in groups this size (as `ENTRY_DELETE_CHUNK`). */
export const SHARE_CHUNK = 100;

export interface PlaceVisibility {
  id: string;
  player_visible_to: string[];
}

/**
 * Who each place of the campaign is shown to. The Atlas's slim list (`useAllLocations`) leaves
 * `player_visible_to` out, and the picker cannot tell a shared place from a private one without it, so this reads
 * just that column. It sits under the `locations` root, so the doorbell's `locations` ring refreshes it with the rest.
 */
export function useLocationVisibility(campaignId: MaybeRefOrGetter<string | null | undefined>) {
  const id = computed(() => toValue(campaignId) ?? null);
  return useQuery({
    queryKey: computed(() => ["locations", id.value, "open-book-visibility"] as const),
    queryFn: async (): Promise<PlaceVisibility[]> => {
      if (id.value === null) throw new Error("useLocationVisibility fetched without a campaign");
      const { data, error } = await supabase
        .from("locations")
        .select("id, player_visible_to")
        .eq("campaign_id", id.value);
      if (error) throw error;
      return data as PlaceVisibility[];
    },
    enabled: computed(() => id.value !== null),
  });
}

export interface ShareTarget {
  type: OpenBookEntityType;
  ids: readonly string[];
}

/**
 * Shows entries to the whole party: each one's `player_visible_to` becomes every party member id. An NPC the DM
 * has never shared also gets the default field list, exactly as `npcShareUpdate` does for one NPC, or the party
 * would see a name-less shell; `seedNpcFields` names those.
 */
export function useShareWithParty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      partyIds,
      targets,
      seedNpcFields,
    }: {
      partyIds: readonly string[];
      targets: readonly ShareTarget[];
      seedNpcFields: ReadonlySet<string>;
    }) => {
      if (partyIds.length === 0) throw new Error("Sharing with the party needs at least one party member");
      const visible = [...partyIds];
      for (const { type, ids } of targets) {
        const unique = [...new Set(ids)];
        if (type === "npc") {
          const seeded = unique.filter((id) => seedNpcFields.has(id));
          const rest = unique.filter((id) => !seedNpcFields.has(id));
          for (const group of chunkArray(seeded, SHARE_CHUNK)) {
            const { error } = await supabase
              .from("npcs")
              .update({ player_visible_to: visible, player_visible_fields: fieldsForFirstReveal([]) })
              .in("id", group);
            if (error) throw error;
          }
          for (const group of chunkArray(rest, SHARE_CHUNK)) {
            const { error } = await supabase.from("npcs").update({ player_visible_to: visible }).in("id", group);
            if (error) throw error;
          }
          continue;
        }
        for (const group of chunkArray(unique, SHARE_CHUNK)) {
          const { error } = await WRITERS[type](group, visible);
          if (error) throw error;
        }
      }
    },
    onSettled: () =>
      Promise.all(
        ["locations", "npcs", "factions", "pantheons", "deities", "notes"].map((root) =>
          queryClient.invalidateQueries({ queryKey: [root] }),
        ),
      ).then(() => queryClient.invalidateQueries({ queryKey: [OPEN_BOOK_KEY, "preview"] })),
  });
}

type Write = (ids: string[], visible: string[]) => PromiseLike<{ error: unknown }>;

const WRITERS: Record<Exclude<OpenBookEntityType, "npc">, Write> = {
  location: (ids, v) => supabase.from("locations").update({ player_visible_to: v }).in("id", ids),
  faction: (ids, v) => supabase.from("factions").update({ player_visible_to: v }).in("id", ids),
  pantheon: (ids, v) => supabase.from("pantheons").update({ player_visible_to: v }).in("id", ids),
  deity: (ids, v) => supabase.from("deities").update({ player_visible_to: v }).in("id", ids),
  note: (ids, v) => supabase.from("notes").update({ player_visible_to: v }).in("id", ids),
};
