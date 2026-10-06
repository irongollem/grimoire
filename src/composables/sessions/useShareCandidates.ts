import { computed, type Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useDiscoveredKeys, useToggleMonsterDiscovery } from "@/composables/encounters/useDiscoveredMonsters";
import { useUpdateLocation } from "@/composables/locations/useLocations";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useNpcs, useUpdateNpc } from "@/composables/npcs/useNpcs";
import { useHandoutSharing } from "@/composables/scriptorium/useHandoutShare";
import { useScriptoriumDocuments } from "@/composables/scriptorium/useScriptorium";
import type { FileSharedInput } from "@/composables/sessions/useSessionLearned";
import { npcShareUpdate } from "@/composables/npcs/useNpcReveal";
import { useCampaignStore } from "@/stores/campaign";

/** What the "forgot to share" flow can share. Quests are not among them: a quest begins on its own surface. */
export type ShareKind = "person" | "place" | "handout" | "creature";

/** What was shared, as the filing step needs it (the session is added by the caller). */
export type SharedTarget =
  | Omit<Extract<FileSharedInput, { entityId: string }>, "sessionId">
  | Omit<Extract<FileSharedInput, { id: string }>, "sessionId">;

interface Option {
  id: string;
  name: string;
}

/** Places nobody has been told about; the slim list the tree uses has no sharing column. */
function useUnsharedPlaces(enabled: () => boolean) {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => ["locations", campaign.activeCampaignId, "unshared-names"] as const),
    queryFn: async ({ queryKey: [, cid] }): Promise<Option[]> => {
      if (cid === null) throw new Error("Unshared places fetched without a campaign");
      const { data, error } = await supabase
        .from("locations")
        .select("id, name")
        .eq("campaign_id", cid)
        .eq("player_visible_to", "{}")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Option[];
    },
    enabled: () => !!campaign.activeCampaignId && enabled(),
  });
}

/**
 * The not-yet-shared things of one kind to pick from, and the share for that
 * kind through the write the entity's own Share control makes. Resolves once
 * the share has been saved, so the reveal rows it created exist.
 */
export function useShareCandidates(kind: Ref<ShareKind>) {
  const campaign = useCampaignStore();
  const { data: npcs } = useNpcs(() => kind.value === "person");
  const { data: places } = useUnsharedPlaces(() => kind.value === "place");
  const { data: documents } = useScriptoriumDocuments();
  const { data: monsterIndex } = useMonsterIndex(() => ({ enabled: kind.value === "creature", sides: "both" }));
  const discovered = useDiscoveredKeys();

  const updateNpc = useUpdateNpc();
  const updateLocation = useUpdateLocation();
  const handouts = useHandoutSharing();
  const discover = useToggleMonsterDiscovery();

  const options = computed<Option[]>(() => {
    switch (kind.value) {
      case "person":
        return (npcs.value ?? [])
          .filter((n) => n.campaign_id === campaign.activeCampaignId && n.player_visible_to.length === 0)
          .map((n) => ({ id: n.id, name: n.name }));
      case "place":
        return places.value ?? [];
      case "handout":
        return (documents.value ?? [])
          .filter((d) => d.campaign_id === campaign.activeCampaignId && d.player_visible_to.length === 0)
          .map((d) => ({ id: d.id, name: d.title }));
      case "creature":
        return (monsterIndex.value ?? [])
          .filter((m) => !discovered.value.has(m.id))
          .map((m) => ({ id: m.id, name: m.name }));
    }
  });

  async function share(entityId: string, memberIds: string[]): Promise<SharedTarget> {
    switch (kind.value) {
      case "person": {
        const npc = (npcs.value ?? []).find((n) => n.id === entityId);
        if (!npc) throw new Error("That person is no longer in the campaign");
        await updateNpc.mutateAsync({
          id: npc.id,
          update: npcShareUpdate([...new Set([...npc.player_visible_to, ...memberIds])], npc.player_visible_fields),
        });
        return { table: "npc_reveals", entityColumn: "npc_id", entityId, memberIds };
      }
      case "place":
        await updateLocation.mutateAsync({ id: entityId, update: { player_visible_to: memberIds } });
        return { table: "location_reveals", entityColumn: "location_id", entityId, memberIds };
      case "handout":
        await handouts.share(entityId, memberIds);
        return { table: "handout_reveals", entityColumn: "document_id", entityId, memberIds };
      case "creature": {
        const monster = (monsterIndex.value ?? []).find((m) => m.id === entityId);
        if (!monster) throw new Error("That creature is no longer in the bestiary");
        const row = await discover.mutateAsync({
          monster: { id: monster.id, is_shared: monster.is_shared },
          currentDiscovery: undefined,
          visibleTo: memberIds,
        });
        if (!row) throw new Error("The discovery was not saved");
        return { table: "discovered_monsters", id: row.id };
      }
    }
  }

  return { options, share };
}
