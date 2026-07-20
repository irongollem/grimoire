import { computed } from "vue";
import type { ComputedRef, Ref } from "vue";
import { getMulticlassSpellSlots } from "@/types/spell.types";
import type { SpellSlotEntry } from "@/types/party.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { getSpellPreparationPolicy } from "@/lib/spellPreparationPolicy";

interface ClassDataRef {
  spell_slots?: number[][] | null;
  spells_known?: number[] | null;
  cantrips_known?: number[] | null;
}

interface ClassEntry {
  id: string;
  class_name: string;
  levels: number;
}

export function useLevelUpSpellSlots(opts: {
  customClass: ComputedRef<ClassDataRef | null | undefined>;
  systemClass: ComputedRef<ClassDataRef | null | undefined>;
  levelInChosenClass: ComputedRef<number>;
  memberClassEntries: ComputedRef<ClassEntry[]>;
  isAddingNewClass: ComputedRef<boolean>;
  newClassName: Ref<string>;
  chosenExistingEntry: ComputedRef<ClassEntry | null>;
  ruleset: ComputedRef<RulesetKey>;
}) {
  const {
    customClass, systemClass, levelInChosenClass,
    memberClassEntries, isAddingNewClass, newClassName, chosenExistingEntry, ruleset,
  } = opts;

  const prevLevelInChosenClass = computed(() => Math.max(0, levelInChosenClass.value - 1));
  const chosenClassName = computed(() =>
    chosenExistingEntry.value?.class_name ?? newClassName.value,
  );
  const revisedPolicy = computed(() =>
    getSpellPreparationPolicy(chosenClassName.value, ruleset.value),
  );

  function dbSlots(level: number): SpellSlotEntry[] {
    const cls = customClass.value ?? systemClass.value;
    const row = cls?.spell_slots?.[Math.min(level, 20) - 1];
    if (!row) return [];
    return row.map((max, i) => ({ level: i + 1, max, used: 0 })).filter(s => s.max > 0);
  }

  const prevSpellSlots = computed<SpellSlotEntry[]>(() => dbSlots(prevLevelInChosenClass.value));
  const newSpellSlots  = computed<SpellSlotEntry[]>(() => dbSlots(levelInChosenClass.value));

  const postLevelupClassList = computed<{ class_name: string; levels: number }[]>(() => {
    const entries = memberClassEntries.value;
    if (isAddingNewClass.value && newClassName.value) {
      return [
        ...entries.map(e => ({ class_name: e.class_name, levels: e.levels })),
        { class_name: newClassName.value, levels: 1 },
      ];
    }
    if (chosenExistingEntry.value) {
      const chosenId = chosenExistingEntry.value.id;
      return entries.map(e => ({
        class_name: e.class_name,
        levels: e.id === chosenId ? e.levels + 1 : e.levels,
      }));
    }
    return [];
  });

  const preLevelupClassList = computed<{ class_name: string; levels: number }[]>(() =>
    memberClassEntries.value.map(e => ({ class_name: e.class_name, levels: e.levels })),
  );

  const postLevelupSpellSlots = computed<SpellSlotEntry[]>(() => {
    if (postLevelupClassList.value.length > 1) {
      return getMulticlassSpellSlots(postLevelupClassList.value, ruleset.value);
    }
    return newSpellSlots.value;
  });

  const preLevelupSpellSlots = computed<SpellSlotEntry[]>(() => {
    if (preLevelupClassList.value.length > 1) {
      return getMulticlassSpellSlots(preLevelupClassList.value, ruleset.value);
    }
    return prevSpellSlots.value;
  });

  const newSpellSlotSummary = computed(() => {
    const prev = preLevelupSpellSlots.value;
    const next = postLevelupSpellSlots.value;
    if (next.length === 0) return null;
    const gains: string[] = [];
    for (const slot of next) {
      const old = prev.find(s => s.level === slot.level);
      if (!old) gains.push(`${slot.max}× level-${slot.level}`);
      else if (slot.max > old.max) gains.push(`+${slot.max - old.max} level-${slot.level}`);
    }
    if (gains.length === 0) return null;
    return `Spell slots: ${gains.join(", ")}`;
  });

  const spellsKnownGain = computed(() => {
    const policyTable = revisedPolicy.value?.casterType === "prepared"
      ? revisedPolicy.value.prepared
      : null;
    const table = policyTable ?? customClass.value?.spells_known ?? systemClass.value?.spells_known;
    if (!table) return 0;
    const cur  = table[levelInChosenClass.value - 1] ?? 0;
    const prev = table[prevLevelInChosenClass.value - 1] ?? 0;
    return Math.max(0, cur - prev);
  });

  const spellsKnownTotal = computed(() => {
    const policyTable = revisedPolicy.value?.casterType === "prepared"
      ? revisedPolicy.value.prepared
      : null;
    const table = policyTable ?? customClass.value?.spells_known ?? systemClass.value?.spells_known;
    return table?.[levelInChosenClass.value - 1] ?? 0;
  });

  const cantripsKnownGain = computed(() => {
    const table = revisedPolicy.value?.cantrips
      ?? customClass.value?.cantrips_known
      ?? systemClass.value?.cantrips_known;
    if (!table) return 0;
    const cur  = table[levelInChosenClass.value - 1] ?? 0;
    const prev = table[prevLevelInChosenClass.value - 1] ?? 0;
    return Math.max(0, cur - prev);
  });

  const cantripsKnownTotal = computed(() => {
    const table = revisedPolicy.value?.cantrips
      ?? customClass.value?.cantrips_known
      ?? systemClass.value?.cantrips_known;
    return table?.[levelInChosenClass.value - 1] ?? 0;
  });

  const maxCastableLevel = computed(() => {
    const slots = newSpellSlots.value;
    if (slots.length === 0) return 9;
    return Math.max(...slots.map(s => s.level));
  });

  return {
    prevLevelInChosenClass,
    postLevelupSpellSlots,
    newSpellSlotSummary,
    spellsKnownGain,
    spellsKnownTotal,
    cantripsKnownGain,
    cantripsKnownTotal,
    maxCastableLevel,
  };
}
