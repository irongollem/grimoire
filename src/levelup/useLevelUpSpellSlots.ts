import { computed } from "vue";
import type { ComputedRef, Ref } from "vue";
import { getMulticlassSpellSlots } from "@/types/spell.types";
import type { CasterCategory, CasterClassEntry, CasterType } from "@/types/spell.types";
import { castingFor, type EffectiveCasting, type SubclassCastingLike } from "@/rules/subclassCasting";
import type { CharacterClass } from "@/types/multiclass.types";
import type { SpellSlotEntry } from "@/types/party.types";
import type { RulesetKey } from "@/types/ruleset.types";
import {
  getSpellPreparationPolicy,
  levelUpSpellChoiceCount,
  type SpellDefinitionKind,
} from "@/rules/spellPreparationPolicy";

interface ClassDataRef {
  spell_slots?: number[][] | null;
  spells_known?: number[] | null;
  cantrips_known?: number[] | null;
  caster_type?: CasterType | null;
}

type ClassEntry = CharacterClass;

export function useLevelUpSpellSlots(opts: {
  customClass: ComputedRef<ClassDataRef | null | undefined>;
  systemClass: ComputedRef<ClassDataRef | null | undefined>;
  levelInChosenClass: ComputedRef<number>;
  memberClassEntries: ComputedRef<ClassEntry[]>;
  isAddingNewClass: ComputedRef<boolean>;
  newClassName: Readonly<Ref<string>>;
  chosenExistingEntry: ComputedRef<ClassEntry | null>;
  ruleset: ComputedRef<RulesetKey>;
  /**
   * The subclass of the class being levelled: the one picked at this very level,
   * else the one already held. The server resolves it the same way
   * (`required_level_up_spell_choices(.., p_subclass_definition_id)`).
   */
  chosenSubclass: ComputedRef<SubclassCastingLike | null | undefined>;
  /** What each OTHER held class row casts with (its class, or its subclass). */
  rowCasting: (entry: ClassEntry) => EffectiveCasting | null;
  /**
   * Whether the pinned class definition for this level-up is the official
   * system class or a campaign's custom class. Only "system" may use the
   * 2024 policy tables / Wizard spellbook special-case — see
   * levelUpSpellChoiceCount for why. Defaults to "system" to match the
   * server's coalesce(p_definition_kind, 'system').
   */
  definitionKind?: ComputedRef<SpellDefinitionKind>;
}) {
  const {
    customClass, systemClass, levelInChosenClass,
    memberClassEntries, isAddingNewClass, newClassName, chosenExistingEntry, ruleset,
    chosenSubclass, rowCasting,
  } = opts;
  const definitionKind = opts.definitionKind ?? computed<SpellDefinitionKind>(() => "system");

  const prevLevelInChosenClass = computed(() => Math.max(0, levelInChosenClass.value - 1));
  const chosenClassName = computed(() =>
    chosenExistingEntry.value?.class_name ?? newClassName.value,
  );
  // A class that casts casts from its class; otherwise from the subclass (a third caster).
  const chosenCasting = computed(() =>
    castingFor(customClass.value ?? systemClass.value, chosenSubclass.value),
  );
  const chosenCasterType = computed<CasterType | null>(() => chosenCasting.value?.casterType ?? null);
  // Only a "system" definition may use the 2024 policy tables — a "custom"
  // definition (even one sharing an official class's name) always falls back
  // to its own spells_known/cantrips_known progression. Mirrors
  // required_level_up_spell_choices (migration 20260720000026).
  const revisedPolicy = computed(() =>
    definitionKind.value === "system" ? getSpellPreparationPolicy(chosenClassName.value, ruleset.value) : null,
  );

  function dbSlots(level: number): SpellSlotEntry[] {
    const row = chosenCasting.value?.spellSlots?.[Math.min(level, 20) - 1];
    if (!row) return [];
    return row.map((max, i) => ({ level: i + 1, max, used: 0 })).filter(s => s.max > 0);
  }

  const prevSpellSlots = computed<SpellSlotEntry[]>(() => dbSlots(prevLevelInChosenClass.value));
  const newSpellSlots  = computed<SpellSlotEntry[]>(() => dbSlots(levelInChosenClass.value));

  /** A held row that casts only through its subclass counts as a third caster in the multiclass sum. */
  function categoryOf(casting: EffectiveCasting | null): { category?: CasterCategory } {
    return casting?.source === "subclass" ? { category: "third" } : {};
  }

  const postLevelupClassList = computed<CasterClassEntry[]>(() => {
    const entries = memberClassEntries.value;
    if (isAddingNewClass.value && newClassName.value) {
      return [
        ...entries.map(e => ({ class_name: e.class_name, levels: e.levels, ...categoryOf(rowCasting(e)) })),
        // 1 for a further class; a classless character's first class carries the
        // member's whole new level (see `levelInChosenClass`).
        { class_name: newClassName.value, levels: levelInChosenClass.value, ...categoryOf(chosenCasting.value) },
      ];
    }
    if (chosenExistingEntry.value) {
      const chosenId = chosenExistingEntry.value.id;
      return entries.map(e => e.id === chosenId
        ? { class_name: e.class_name, levels: e.levels + 1, ...categoryOf(chosenCasting.value) }
        : { class_name: e.class_name, levels: e.levels, ...categoryOf(rowCasting(e)) });
    }
    return [];
  });

  const preLevelupClassList = computed<CasterClassEntry[]>(() =>
    memberClassEntries.value.map(e => ({ class_name: e.class_name, levels: e.levels, ...categoryOf(rowCasting(e)) })),
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
    return levelUpSpellChoiceCount(
      chosenClassName.value,
      ruleset.value,
      levelInChosenClass.value,
      chosenCasting.value?.spellsKnown,
      definitionKind.value,
      chosenCasterType.value,
    );
  });

  const spellsKnownTotal = computed(() => {
    if (chosenClassName.value === "Wizard" && definitionKind.value === "system") {
      return levelInChosenClass.value <= 0 ? 0 : 6 + (levelInChosenClass.value - 1) * 2;
    }
    const policyTable = revisedPolicy.value?.casterType === "prepared"
      ? revisedPolicy.value.prepared
      : null;
    const table = policyTable ?? chosenCasting.value?.spellsKnown;
    return table?.[levelInChosenClass.value - 1] ?? 0;
  });

  const cantripsKnownGain = computed(() => {
    const table = revisedPolicy.value?.cantrips
      ?? chosenCasting.value?.cantripsKnown;
    if (!table) return 0;
    const cur  = table[levelInChosenClass.value - 1] ?? 0;
    const prev = table[prevLevelInChosenClass.value - 1] ?? 0;
    return Math.max(0, cur - prev);
  });

  const cantripsKnownTotal = computed(() => {
    const table = revisedPolicy.value?.cantrips
      ?? chosenCasting.value?.cantripsKnown;
    return table?.[levelInChosenClass.value - 1] ?? 0;
  });

  const maxCastableLevel = computed(() => {
    const slots = newSpellSlots.value;
    if (slots.length === 0) return 9;
    return Math.max(...slots.map(s => s.level));
  });

  return {
    chosenCasting,
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
