import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { placeRoute } from "@/lib/locations/placeRoute";

export type BacklinkKind = "note" | "npc" | "location" | "faction" | "quest-beat" | "party-member";

export interface EntityBacklink {
  kind: BacklinkKind;
  id: string;
  title: string;
  to: string;
}

export const BACKLINKS_KEY = "backlinks";

/** One row of `get_entity_backlinks` (migration 20261004221637). */
export interface BacklinkRow {
  kind: BacklinkKind;
  id: string;
  title: string | null;
  quest_id: string | null;
  quest_title: string | null;
}

const KIND_ORDER: Record<BacklinkKind, number> = {
  note: 0,
  npc: 1,
  location: 2,
  faction: 3,
  "quest-beat": 4,
  "party-member": 5,
};

/** A row as the "Mentioned in" list shows it: its title and where it links. */
export function backlinkFromRow(row: BacklinkRow): EntityBacklink {
  const title = row.title ?? "";
  switch (row.kind) {
    case "note":
      return { kind: row.kind, id: row.id, title: title || "Untitled note", to: `/notes/${row.id}` };
    case "npc":
      return { kind: row.kind, id: row.id, title, to: `/npcs/${row.id}` };
    case "location":
      return { kind: row.kind, id: row.id, title, to: placeRoute(row.id) };
    case "faction":
      return { kind: row.kind, id: row.id, title, to: `/factions/${row.id}` };
    case "quest-beat":
      return {
        kind: row.kind,
        id: row.id,
        title: `${row.quest_title || "Untitled quest"} · ${title}`,
        to: `/quests/${row.quest_id}/beats/${row.id}`,
      };
    case "party-member":
      return { kind: row.kind, id: row.id, title, to: `/party/${row.id}` };
  }
}

async function fetchBacklinks(campaignId: string, entityId: string): Promise<EntityBacklink[]> {
  const { data, error } = await supabase.rpc("get_entity_backlinks", {
    p_campaign_id: campaignId,
    p_target_id: entityId,
  });
  if (error) throw error;
  return (data as BacklinkRow[])
    .map(backlinkFromRow)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title));
}

/**
 * Everything in this campaign that `@mentions` an entity: the "Mentioned in"
 * section on a DM detail surface (epic #932, stories 1 and 3).
 *
 * Mentions are extracted when the text is written, into `entity_mentions`
 * (a trigger on notes, NPCs, locations, factions, quest beats and party
 * members), and read here in one call that joins back to each source as the
 * caller (#972). It used to be six `like '%id%'` scans on every open, which
 * could not be cached because nothing could invalidate it. Now the index rings
 * the `entity_mentions` doorbell, which `useCampaignLiveSync` maps to this key,
 * so it is cached like any other campaign read. An entity never lists itself.
 */
export function useEntityBacklinks(entityId: MaybeRefOrGetter<string | null | undefined>) {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useQuery({
    queryKey: computed(() => [BACKLINKS_KEY, activeCampaignId.value, toValue(entityId)] as const),
    queryFn: ({ queryKey: [, campaignId, id] }) => {
      if (!campaignId || !id) throw new Error("useEntityBacklinks fetched without a campaign or an entity");
      return fetchBacklinks(campaignId, id);
    },
    enabled: () => !!activeCampaignId.value && !!toValue(entityId),
  });
}
