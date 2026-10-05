import { computed, ref, watch, type ComputedRef } from "vue";
import { useCampaignCustomSubclasses } from "@/composables/rules/useCustomSubclasses";
import { useCampaignSystemClasses, useCampaignCustomClasses } from "@/composables/rules/useCustomClasses";
import { useCharacterClasses, useMulticlassPrereqs } from "@/composables/party/useCharacterClasses";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/rules/useOptionalRules";
import { meetsMulticlassPrereq } from "@/types/multiclass.types";
import type { CharacterClass } from "@/types/multiclass.types";
import type { PartyMember } from "@/types/party.types";
import type { ClassRowInfo } from "./levelUpProjection";

/**
 * Which class this level is taken in, and everything that follows from the
 * choice: the definition it is pinned to, the subclass, the multiclass gate.
 * Split from the wizard so the wizard itself only composes steps.
 */
export function useLevelUpClassSelection(member: () => PartyMember) {
  const memberIdRef = computed(() => member().id);
  const { data: characterClasses } = useCharacterClasses(memberIdRef);
  const { data: multiclassPrereqs } = useMulticlassPrereqs();
  // Ungated lists resolve the classes the character already has — a class the DM
  // disables mid-campaign must never block levelling what's already on the sheet.
  // Only the *new class* picker below obeys the campaign gate (#566).
  const { data: campaignCustomClasses, all: allCustomClasses } = useCampaignCustomClasses();
  const { data: campaignSystemClasses, all: allSystemClasses } = useCampaignSystemClasses();
  const { data: campaignCustomSubclasses, all: allCustomSubclasses } = useCampaignCustomSubclasses();

  const existingClassOptions = computed<CharacterClass[]>(() => characterClasses.value ?? []);

  /** User's choice for this level-up: either an existing class entry or "__new__" */
  const chosenClassSelector = ref<string>("");

  /** When adding a new class, which class is being taken. */
  const newClassChoiceKey = ref<string>("");

  // Seed the picker on mount / when member classes load. Must be a watch — a
  // lazy computed that is never read in the template would never run, leaving
  // chosenClassSelector "" and silently skipping the character_classes update
  // on confirm. A character with no class rows is classless: it levels up by
  // adding its first class, so the picker starts on "a new class". That has to
  // wait for the load (`undefined`), or every character would start there.
  watch(
    characterClasses,
    (rows) => {
      if (chosenClassSelector.value || rows === undefined) return;
      const primary = rows.find((c) => c.is_primary) ?? rows[0];
      chosenClassSelector.value = primary ? primary.id : "__new__";
    },
    { immediate: true },
  );

  const isAddingNewClass = computed(() => chosenClassSelector.value === "__new__");

  const newClassDefinition = computed(() => {
    const [kind, id] = newClassChoiceKey.value.split(":");
    if (kind === "system") {
      const value = (allSystemClasses.value ?? []).find((c) => c.id === id);
      return value ? { kind: "system" as const, value } : null;
    }
    if (kind === "custom") {
      const value = (allCustomClasses.value ?? []).find((c) => c.id === id);
      return value ? { kind: "custom" as const, value } : null;
    }
    return null;
  });
  const newClassName = computed(() => newClassDefinition.value?.value.class_name ?? "");
  const newClassDefinitionId = computed(() => newClassDefinition.value?.value.id ?? null);
  const newClassDefinitionKind = computed(() => newClassDefinition.value?.kind ?? null);

  const chosenExistingEntry = computed<CharacterClass | null>(() => {
    if (isAddingNewClass.value) return null;
    return existingClassOptions.value.find((c) => c.id === chosenClassSelector.value) ?? null;
  });

  /** The class name for this level-up — existing-class name or newly-picked class. */
  const memberClass = computed(() => {
    if (isAddingNewClass.value) return newClassName.value;
    return chosenExistingEntry.value?.class_name ?? "";
  });

  /** Per-chosen-class level: the level *inside the chosen class* after this bump. */
  const levelInChosenClass = computed(() => {
    if (isAddingNewClass.value) {
      // A classless character's first class carries every level it has banked
      // (apply_level_up wants the member's new total); a further class starts at 1.
      return existingClassOptions.value.length === 0 ? member().level + 1 : 1;
    }
    if (chosenExistingEntry.value) return chosenExistingEntry.value.levels + 1;
    return 1;
  });

  // Every class row is pinned to its definition, so the class resolves by id and
  // kind alone, never by name (a custom class may share an official one's name).
  const exactClassDefinition = computed(() => {
    if (isAddingNewClass.value) return newClassDefinition.value;
    const entry = chosenExistingEntry.value;
    if (!entry) return null;
    if (entry.class_definition_kind === "system") {
      const value = (allSystemClasses.value ?? []).find((c) => c.id === entry.class_definition_id);
      return value ? { kind: "system" as const, value } : null;
    }
    const value = (allCustomClasses.value ?? []).find((c) => c.id === entry.class_definition_id);
    return value ? { kind: "custom" as const, value } : null;
  });
  const customClass = computed(() => (exactClassDefinition.value?.kind === "custom" ? exactClassDefinition.value.value : null));
  const systemClass = computed(() => (exactClassDefinition.value?.kind === "system" ? exactClassDefinition.value.value : undefined));

  const subclassDefinitionId = ref("");
  const customSubclass = computed(() => {
    const id = subclassDefinitionId.value || chosenExistingEntry.value?.subclass_definition_id;
    return id ? ((allCustomSubclasses.value ?? []).find((subclass) => subclass.id === id) ?? null) : null;
  });

  // Classes the character doesn't already have — candidates for a new level.
  const newClassCandidates = computed(() => {
    const existing = new Set(existingClassOptions.value.map((c) => `${c.class_definition_kind}:${c.class_definition_id}`));
    return [
      ...campaignSystemClasses.value.map((c) => ({ key: `system:${c.id}`, label: `${c.class_name} (official)` })),
      ...campaignCustomClasses.value.map((c) => ({
        key: `custom:${c.id}`,
        label: `${c.class_name} (${c.source_document_key ? "imported" : "custom"})`,
      })),
    ]
      .filter((candidate) => !existing.has(candidate.key))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  const { data: campaignRulesData } = useOptionalRules();
  const ignoreMulticlassPrereqs = computed<boolean>(() =>
    isRuleEffectivelyEnabled(campaignRulesData.value, "ignore_multiclass_prereqs"),
  );

  /** Prereq check for the currently-selected new class. */
  const newClassPrereq = computed(() => {
    // A character's first class is not a multiclass, so no prerequisite applies.
    if (!isAddingNewClass.value || !newClassName.value || existingClassOptions.value.length === 0) return { ok: true as const };
    const prereq = (multiclassPrereqs.value ?? []).find((p) => p.class_name === newClassName.value);
    if (!prereq) return { ok: true as const };
    const m = member();
    return meetsMulticlassPrereq(prereq, { str: m.str, dex: m.dex, con: m.con, int: m.int, wis: m.wis, cha: m.cha });
  });

  const newClassProficiencyGrants = computed<string[]>(() => {
    if (!isAddingNewClass.value || !newClassName.value || existingClassOptions.value.length === 0) return [];
    const prereq = (multiclassPrereqs.value ?? []).find((p) => p.class_name === newClassName.value);
    return prereq?.gained_proficiencies ?? [];
  });

  /** The character's class rows with the feature tables they were pinned to, for the sheet's own feature maths. */
  const classRows: ComputedRef<ClassRowInfo[]> = computed(() =>
    existingClassOptions.value.map((row) => {
      const definitions = row.class_definition_kind === "system" ? allSystemClasses.value : allCustomClasses.value;
      const classDef = (definitions ?? []).find((d) => d.id === row.class_definition_id);
      const subclassDef = row.subclass_definition_id
        ? (allCustomSubclasses.value ?? []).find((d) => d.id === row.subclass_definition_id)
        : undefined;
      return {
        id: row.id,
        className: row.class_name,
        subclassName: row.subclass_name,
        levels: row.levels,
        classFeatures: classDef ? classDef.features : null,
        subclassFeatures: subclassDef ? subclassDef.features : null,
        armorProficiencies: classDef ? classDef.armor_proficiencies : [],
      };
    }),
  );

  return {
    existingClassOptions,
    chosenClassSelector,
    newClassChoiceKey,
    isAddingNewClass,
    newClassName,
    newClassDefinition,
    newClassDefinitionId,
    newClassDefinitionKind,
    chosenExistingEntry,
    memberClass,
    levelInChosenClass,
    exactClassDefinition,
    customClass,
    systemClass,
    subclassDefinitionId,
    customSubclass,
    allCustomSubclasses,
    allSystemClasses,
    allCustomClasses,
    campaignCustomSubclasses,
    newClassCandidates,
    ignoreMulticlassPrereqs,
    newClassPrereq,
    newClassProficiencyGrants,
    classRows,
    campaignRulesData,
  };
}
