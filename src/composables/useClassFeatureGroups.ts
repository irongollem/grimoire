import { computed, type Ref } from "vue";
import { useCharacterClasses } from "@/composables/useCharacterClasses";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import { useAllCustomSubclasses } from "@/composables/useCustomSubclasses";
import { useAllFeatures } from "@/composables/useFeatures";
import { mapFeatureIds, type FeatureEntry } from "@/levelup/types";
import type { SystemClass, CustomClass, CustomSubclass } from "@/levelup/customTypes";
import type { CharacterClass } from "@/types/multiclass.types";
import type { PartyMember } from "@/types/party.types";
import type { ClassFeatureGroup } from "@/components/player/PlayerClassFeaturesList.vue";

/**
 * Groups a character's class features (and subclass features) by class, for
 * `PlayerClassFeaturesList`. DM-built characters have no `character_classes`
 * rows (only the player creation wizard seeds one — see
 * `useCharacterClasses.ts`), so this falls back to a single group synthesized
 * from the legacy `party_members.class`/`subclass`/`level` fields.
 */
export function useClassFeatureGroups(member: Ref<PartyMember>) {
  const { data: allFeatures, isPending: featuresPending } = useAllFeatures();
  const featureObjectMap = computed(() => new Map((allFeatures.value ?? []).map(f => [f.id, f])));

  const memberIdRef = computed(() => member.value.id);
  const { data: characterClasses, isPending: classesPending } = useCharacterClasses(memberIdRef);
  const { data: allSystemClasses } = useAllSystemClasses();
  const { data: allCustomClasses } = useAllCustomClasses();
  const { data: allCustomSubclassEntries } = useAllCustomSubclasses();

  const featureDataPending = computed(() => featuresPending.value || classesPending.value);

  /** Legacy name lookup only; pinned character rows resolve by exact id below. */
  const classDataMap = computed(() => {
    const map = new Map<string, SystemClass | CustomClass>();
    for (const c of allCustomClasses.value ?? []) map.set(c.class_name, c);
    for (const c of allSystemClasses.value ?? []) map.set(c.class_name, c);
    return map;
  });

  /** "ClassName::SubclassName" → subclass data. */
  const subclassDataMap = computed(() => {
    const map = new Map<string, CustomSubclass>();
    for (const s of allCustomSubclassEntries.value ?? []) {
      map.set(`${s.class_name}::${s.subclass_name}`, s);
    }
    return map;
  });

  function classDefinitionFor(entry: CharacterClass) {
    if (entry.class_definition_id) {
      const definitions = entry.class_definition_kind === "custom"
        ? (allCustomClasses.value ?? [])
        : (allSystemClasses.value ?? []);
      return definitions.find(definition => definition.id === entry.class_definition_id) ?? null;
    }
    return classDataMap.value.get(entry.class_name) ?? null;
  }

  function subclassDefinitionFor(entry: CharacterClass) {
    if (!entry.subclass_name) return null;
    if (entry.subclass_definition_id) {
      return (allCustomSubclassEntries.value ?? []).find(
        definition => definition.id === entry.subclass_definition_id,
      ) ?? null;
    }
    return subclassDataMap.value.get(`${entry.class_name}::${entry.subclass_name}`) ?? null;
  }

  function buildFeaturesByLevel(
    cls: { features: Record<string, string[]> } | null | undefined,
    maxLevel: number,
  ): Record<number, FeatureEntry[]> {
    if (!cls) return {};
    const result: Record<number, FeatureEntry[]> = {};
    for (let lvl = 1; lvl <= maxLevel; lvl++) {
      const entries = mapFeatureIds(cls.features[lvl.toString()] ?? [], featureObjectMap.value);
      if (entries.length > 0) result[lvl] = entries;
    }
    return result;
  }

  const classFeatureGroups = computed<ClassFeatureGroup[]>(() => {
    const rows = characterClasses.value ?? [];
    if (rows.length > 0) {
      return rows.map(cc => {
        const classDefinition = classDefinitionFor(cc);
        const subclassDefinition = subclassDefinitionFor(cc);
        return {
          class_name: cc.class_name,
          subclass_name: cc.subclass_name,
          levels: cc.levels,
          featuresByLevel: buildFeaturesByLevel(classDefinition, cc.levels),
          subclassFeaturesByLevel: buildFeaturesByLevel(subclassDefinition, cc.levels),
        };
      });
    }
    if (!member.value.class) return [];
    const className = member.value.class;
    const subclassName = member.value.subclass ?? null;
    const levels = member.value.level;
    return [{
      class_name: className,
      subclass_name: subclassName,
      levels,
      featuresByLevel: buildFeaturesByLevel(classDataMap.value.get(className), levels),
      subclassFeaturesByLevel: subclassName
        ? buildFeaturesByLevel(subclassDataMap.value.get(`${className}::${subclassName}`), levels)
        : {},
    }];
  });

  return {
    characterClasses,
    classFeatureGroups,
    featureDataPending,
    classDefinitionFor,
  };
}
