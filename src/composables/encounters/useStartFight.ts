import { ref } from "vue";
import { useRouter } from "vue-router";
import { useCreateEncounter } from "@/composables/encounters/useEncounters";
import { useToast } from "@/composables/useToast";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";

/**
 * Starts a fight where the party stands (#1125 decision 9): a new, empty encounter anchored at a place (the site, or
 * the room the party is in), opened on the Play screen. The fight reads the party's explored squares from there.
 */
export function useStartFight() {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateEncounter();
  const starting = ref(false);

  async function startFightAt(placeId: string, name: string): Promise<void> {
    starting.value = true;
    try {
      const created = await create.mutateAsync({
        name, description: null, party_member_ids: [], companion_ids: [],
        party_member_factions: {}, combatants: [], factions: DEFAULT_FACTIONS, item_ids: [], trap_ids: [],
        reward_currency_pools: [], location_id: placeId, is_finished: false, events: [],
        lair_enabled: false, lair_owner_def_id: null,
      });
      await router.push(`/encounters/${created.id}/run`);
    } catch (e) {
      toast.error(toast.fromError(e));
    } finally {
      starting.value = false;
    }
  }

  return { startFightAt, starting };
}
