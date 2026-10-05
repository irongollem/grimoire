import { computed, type Ref } from "vue";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/rules/useCustomClasses";
import { useAllCustomSubclasses } from "@/composables/rules/useCustomSubclasses";
import { useFeaturesByIds } from "@/composables/rules/useFeatures";
import { useRuleset } from "@/composables/rules/useRuleset";
import type { AbilityKey } from "@/rules/characterCreation";
import {
  classResourcesFor,
  featureIdsNeeded,
  grantedFeatures,
  resourcePools,
} from "@/rules/features/characterFeatures";
import { revertAbilityScoreIncreases, revertLevelChoices } from "@/rules/features/levelUpChoices";
import type { CharacterClass } from "@/types/multiclass.types";
import type { LevelChoiceEntry, PartyMember } from "@/types/party.types";
import { proficiencyBonusAt } from "./buildDeLevelPayload";
import { lowerClasses, type ClassRowInfo } from "./levelUpProjection";

/**
 * The state the character falls back to when its last level is removed, read
 * the way the sheet reads any character: the class rows one level lower, the
 * picks of that level reverted (#976). `classResources` is what that state's
 * pools hold, so the de-level never leaves a maximum from a level that is gone.
 */
export function useDeLevel(member: () => PartyMember, characterClasses: Ref<CharacterClass[]>) {
  const { ruleset } = useRuleset();
  const { data: systemClasses } = useAllSystemClasses();
  const { data: customClasses } = useAllCustomClasses();
  const { data: subclasses } = useAllCustomSubclasses();

  const recorded = computed<LevelChoiceEntry | null>(() => {
    const m = member();
    // A character made at a higher level has no entry for the levels it started with.
    return Object.hasOwn(m.level_choices, m.level) ? m.level_choices[m.level] : null;
  });

  // The row is found by the definition the level was taken in, never by name.
  const classRow = computed<CharacterClass | null>(() => {
    const e = recorded.value;
    if (e === null) return null;
    return characterClasses.value.find((c) => c.class_definition_id === e.class_definition_id) ?? null;
  });

  // An entry whose class row is gone has nothing to take a level from.
  const entry = computed(() => (classRow.value === null ? null : recorded.value));

  const classDef = computed(() => {
    const row = classRow.value;
    if (row === null) return null;
    const list = row.class_definition_kind === "system" ? systemClasses.value : customClasses.value;
    return (list ?? []).find((d) => d.id === row.class_definition_id) ?? null;
  });

  const rows = computed<ClassRowInfo[]>(() =>
    characterClasses.value.map((row) => {
      const defs = row.class_definition_kind === "system" ? systemClasses.value : customClasses.value;
      const def = (defs ?? []).find((d) => d.id === row.class_definition_id);
      const sub = row.subclass_definition_id ? (subclasses.value ?? []).find((d) => d.id === row.subclass_definition_id) : undefined;
      return {
        id: row.id,
        className: row.class_name,
        subclassName: row.subclass_name,
        levels: row.levels,
        classFeatures: def ? def.features : null,
        subclassFeatures: sub ? sub.features : null,
        armorProficiencies: def ? def.armor_proficiencies : [],
      };
    }),
  );

  const lowerChoices = computed<Record<string, unknown>>(() => {
    const e = entry.value;
    return e?.record ? revertLevelChoices(member().class_choices, e.record) : member().class_choices;
  });
  const lower = computed(() => (classRow.value && entry.value ? lowerClasses(rows.value, classRow.value.id, !!entry.value.subclass) : []));
  const idsNeeded = computed(() => featureIdsNeeded(lower.value, lowerChoices.value));
  const { data: features, isPending } = useFeaturesByIds(idsNeeded);

  const classResources = computed(() => {
    const m = member();
    const e = entry.value;
    const level = m.level - 1;
    const levelChoices = { ...m.level_choices };
    delete levelChoices[m.level];
    const granted = grantedFeatures({
      classes: lower.value,
      featuresById: new Map((features.value ?? []).map((f) => [f.id, f])),
      classChoices: lowerChoices.value,
      levelChoices,
      characterLevel: level,
    });
    const scores: Record<AbilityKey, number> = { str: m.str, dex: m.dex, con: m.con, int: m.int, wis: m.wis, cha: m.cha };
    const back = revertAbilityScoreIncreases(scores, e?.record ? e.record.abilityIncreases : {});
    return classResourcesFor(
      resourcePools(granted, { proficiencyBonus: proficiencyBonusAt(level), abilityScores: back, characterLevel: level }),
      m.class_resources,
    );
  });

  return {
    entry,
    classRow,
    ruleset,
    classSlotTable: computed(() => classDef.value?.spell_slots ?? null),
    classResources,
    // Resources are read off the lower state's features, so wait until they are in.
    isLoading: computed(() => idsNeeded.value.length > 0 && isPending.value),
    featuresById: computed(() => new Map((features.value ?? []).map((f) => [f.id, f]))),
  };
}
