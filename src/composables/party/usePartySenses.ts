import { computed, type ComputedRef } from "vue";
import { useParty } from "@/composables/party/useParty";
import { useSpeciesByIds } from "@/composables/rules/useSpecies";
import { characterSenses, type CharacterSenses } from "@/rules/characterSenses";

/**
 * The senses of every party member the caller can read, from one species lookup. Returns a function from a
 * combatant's `party_member_id` to that member's senses; null for an unknown or unreadable member (the caller then
 * assumes no senses).
 */
export function usePartySenses(): ComputedRef<(partyMemberId: string | null | undefined) => CharacterSenses | null> {
  const { data: party } = useParty();
  const { data: speciesById } = useSpeciesByIds(() => (party.value ? party.value.map((m) => m.species_id) : []));
  return computed(() => {
    const members = new Map((party.value ? party.value : []).map((m) => [m.id, m]));
    return (partyMemberId) => {
      const member = partyMemberId ? members.get(partyMemberId) : undefined;
      if (!member) return null;
      const species = member.species_id ? speciesById.value.get(member.species_id) : undefined;
      return characterSenses({ species, subrace: member.subrace, senses: member.senses });
    };
  });
}
