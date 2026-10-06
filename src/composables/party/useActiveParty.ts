import { computed } from "vue";
import { useParty } from "@/composables/party/useParty";
import { useCampaignMemorials } from "@/composables/memorials/useMemorials";
import type { PartyMember } from "@/types/party.types";
import type { CharacterMemorial } from "@/types/memorial.types";

/** Members without a memorial in effect (restored_at is null means on the wall). */
export function activeMembers(
  members: readonly PartyMember[],
  memorials: readonly CharacterMemorial[],
): PartyMember[] {
  const down = new Set(memorials.filter((m) => m.restored_at === null).map((m) => m.party_member_id));
  return members.filter((m) => !down.has(m.id));
}

/**
 * The party as it sits at the table: `useParty()` minus the fallen and retired.
 *
 * `useParty()` itself stays unfiltered on purpose: a fallen character's sheet,
 * mentions, journal links and entity pickers must still resolve it. Use this
 * for the surfaces that mean "who is playing" (initiative, rests, awards).
 *
 * `data` stays undefined until BOTH the party and the memorials have loaded,
 * so no caller can act on fallen members in the gap (seeding a run, submitting
 * a portrait). A failed memorial read is an error here too, never a quiet
 * fall-back to the full party. `enabled` defers both fetches, as for `useParty`.
 */
export function useActiveParty(enabled?: () => boolean) {
  const party = useParty(enabled);
  const memorials = useCampaignMemorials(undefined, enabled);
  const data = computed(() => {
    const members = party.data.value;
    const rows = memorials.data.value;
    return members && rows ? activeMembers(members, rows) : undefined;
  });
  const error = computed(() => party.error.value ?? memorials.error.value);
  const isError = computed(() => party.isError.value || memorials.isError.value);
  const isPending = computed(() => party.isPending.value || memorials.isPending.value);
  const isLoading = computed(() => party.isLoading.value || memorials.isLoading.value);
  const refetch = async () => {
    await Promise.all([party.refetch(), memorials.refetch()]);
  };
  return { ...party, data, error, isError, isPending, isLoading, refetch };
}
