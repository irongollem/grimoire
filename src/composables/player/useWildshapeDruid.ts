import { computed, type Ref } from "vue";
import { useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useRuleset } from "@/composables/rules/useRuleset";
import { druidProfile, wildshapeCrDisplay, wildShapeRulesFor } from "@/rules/wildshape";
import type { PartyMember } from "@/types/party.types";

/**
 * A character's Wild Shape standing: whether they are a druid, at what druid
 * level and circle, and the CR cap that follows. The one reader of it for the
 * player sheet, the player bestiary and the encounter runner; the derivation
 * itself is `druidProfile` in `src/rules/wildshape.ts`, and the edition's rules
 * (uses, CR cap, HP model, ...) come from `wildShapeRules`, read through
 * `useRuleset()` so a per-character edition needs no change here.
 */
export function useWildshapeDruid(
  memberId: Ref<string | null | undefined>,
  member: () => PartyMember | null | undefined,
) {
  const { data: classRows } = useCharacterClasses(memberId);
  const profile = computed(() => druidProfile(classRows.value ?? []));
  const { ruleset } = useRuleset();
  const rules = computed(() => wildShapeRulesFor(member(), classRows.value ?? [], ruleset.value));
  const maxCr = computed(() => rules.value.maxCr);
  return {
    isDruid: computed(() => profile.value.isDruid),
    druidLevel: computed(() => profile.value.druidLevel),
    isCircleOfMoon: computed(() => profile.value.isCircleOfMoon),
    rules,
    maxCr,
    maxCrDisplay: computed(() => wildshapeCrDisplay(maxCr.value)),
  };
}
