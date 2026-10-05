import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { usePlayerMonstersByIds } from "@/composables/monsters/usePlayerMonstersByIds";
import type { WildshapeState } from "@/types/encounter.types";
import type { PartyMember } from "@/types/party.types";

/**
 * A member's active Wild Shape form and its monster. Resolved by id through
 * `usePlayerMonstersByIds`, not the DM's bestiary: a player cannot read the
 * `monsters` table at all (see PlayerWildShapeTab). Only the active form is
 * asked for. Shared by the character sheet and Hearth.
 */
export function useWildshapeForm(member: MaybeRefOrGetter<PartyMember | null | undefined>) {
  const activeWildshape = computed<WildshapeState | null>(
    () => (toValue(member)?.wildshape_state as WildshapeState | null) ?? null,
  );
  const { data: formMonsters } = usePlayerMonstersByIds(() => [activeWildshape.value?.monster_id]);
  const beastMonster = computed(() => {
    if (!activeWildshape.value) return null;
    return formMonsters.value.get(activeWildshape.value.monster_id) ?? null;
  });
  return { activeWildshape, beastMonster };
}
