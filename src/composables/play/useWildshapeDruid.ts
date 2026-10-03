import { computed, type Ref } from "vue";
import { useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { druidProfile, wildshapeCrDisplay, wildshapeMaxCr } from "@/rules/wildshape";

/**
 * A character's Wild Shape standing: whether they are a druid, at what druid
 * level and circle, and the CR cap that follows. The one reader of it for the
 * player sheet, the player bestiary and the encounter runner; the derivation
 * itself is `druidProfile` in `src/rules/wildshape.ts`.
 */
export function useWildshapeDruid(memberId: Ref<string | null | undefined>) {
  const { data: classRows } = useCharacterClasses(memberId);
  const profile = computed(() => druidProfile(classRows.value ?? []));
  const maxCr = computed(() => wildshapeMaxCr(profile.value.druidLevel, profile.value.isCircleOfMoon));
  return {
    isDruid: computed(() => profile.value.isDruid),
    druidLevel: computed(() => profile.value.druidLevel),
    isCircleOfMoon: computed(() => profile.value.isCircleOfMoon),
    maxCr,
    maxCrDisplay: computed(() => wildshapeCrDisplay(maxCr.value)),
  };
}
