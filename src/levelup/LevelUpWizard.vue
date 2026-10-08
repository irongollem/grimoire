<template>
  <div class="space-y-6 max-w-lg mx-auto">
    <!-- Header -->
    <div class="text-center space-y-1">
      <p class="text-label-lg text-primary uppercase">Level Up</p>
      <h2 class="text-title font-bold text-foreground">
        {{ member.name }}
        <span class="text-muted-foreground">→ Level {{ nextLevel }}</span>
      </h2>
      <p v-if="member.class" class="text-body text-muted-foreground italic">{{ member.class }}</p>
      <!-- Multi-level progress indicator -->
      <div v-if="targetLevel && targetLevel > nextLevel" class="flex items-center justify-center gap-1 mt-2 flex-wrap">
        <template v-for="lvl in (targetLevel - member.level)" :key="lvl">
          <span class="text-label px-1.5 py-0.5 rounded"
            :class="lvl === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'">
            {{ member.level + lvl }}
          </span>
          <span v-if="lvl < (targetLevel - member.level)" class="text-muted-foreground/40 text-xs">→</span>
        </template>
        <span class="text-label text-muted-foreground ml-1">({{ nextLevel - member.level }} of {{ targetLevel - member.level }})</span>
      </div>
    </div>

    <!-- Max level guard -->
    <div v-if="nextLevel > 20" class="rounded-lg border border-border bg-card p-6 text-center">
      <p class="text-body text-muted-foreground">{{ member.name }} has already reached level 20.</p>
    </div>

    <template v-else>
      <!-- Class picker -->
      <LevelUpClassPicker
        v-model="chosenClassSelector"
        v-model:new-class-name="newClassChoiceKey"
        :existing-class-options="existingClassOptions"
        :new-class-candidates="newClassCandidates"
        :prereq="newClassPrereq"
        :ignore-prereqs="ignoreMulticlassPrereqs"
        :proficiency-grants="newClassProficiencyGrants"
        :is-adding-new-class="isAddingNewClass"
      />

      <!--
        Nothing below can be said until a class is chosen: a character taking
        its first class has none yet, and "no feature data for this class" or
        "loading the hit die" would describe a class nobody picked.
      -->
      <p v-if="!memberClass" class="text-body text-muted-foreground italic" data-testid="pick-class-first">
        Pick a class to see what this level gives.
      </p>

      <!-- Features gained -->
      <LevelUpFeaturesGained
        v-if="memberClass"
        :gained="gained"
        :scaling="scaling"
        :pools="pools"
        :has-class-data="!!(systemClass || customClass)"
        :class-level="levelInChosenClass"
        :class-name="memberClass"
        :cantrips-known-gain="cantripsKnownGain"
        :cantrips-known-total="cantripsKnownTotal"
        :spells-known-gain="spellsKnownGain"
        :spells-known-total="spellsKnownTotal"
        :prof-bonus-bumped="newProfBonus !== member.proficiency_bonus"
        :new-prof-bonus="newProfBonus"
        :spell-slot-summary="newSpellSlotSummary"
      />

      <!-- Hit Points -->
      <LevelUpHitPoints
        v-if="hitDie !== null && hpAverageValue !== null"
        :hit-die="hitDie"
        :con-mod="conMod"
        :hp-mode="hpMode"
        :rolled-hp="rolledHp"
        :hp-average-value="hpAverageValue"
        :hp-gain="hpGain"
        :current-max-hp="member.max_hp"
        :current-hit-dice="currentHitDice"
        :new-hit-dice-count="newHitDiceCount"
        @set-mode="setHpMode"
        @roll="rollHp"
      />
      <p v-else-if="memberClass" class="text-caption text-muted-foreground italic">Loading the class's hit die…</p>

      <!-- Subclass choice -->
      <LevelUpSubclassPicker
        v-if="needsSubclassChoice"
        v-model:selected-id="subclassDefinitionId"
        :next-level="nextLevel"
        :class-name="memberClass"
        :subclass-options="subclassOptions"
        @update:model-value="subclassInput = $event"
      />

      <!-- What the subclass grants at this level, and the option those grants depend on -->
      <LevelUpSubclassSpells
        v-if="memberClass"
        :variant="subclassVariant || heldVariant || ''"
        :subclass="customSubclass"
        :class-level="levelInChosenClass"
        :ask="variantDue"
        @update:variant="subclassVariant = $event"
      />

      <!-- Everything the new features ask for: ability scores or a feat, invocations, expertise, swaps -->
      <LevelUpChoices
        v-if="memberClass"
        v-model:values="choiceValues"
        v-model:swaps="swapPicks"
        v-model:complete="choicesComplete"
        :due="due"
        :swap-offers="swapOffers"
        :context="optionContext"
        :feats-by-id="featuresById"
        :feats-allowed="featsAllowed"
        :spell-variant-for="spellVariantFor"
      />

      <!-- Spell picker (known casters gaining spells) -->
      <LevelUpSpellPicker
        v-if="spellsKnownGain > 0"
        title="Choose New Spells"
        :is-cantrip="false"
        :needed="spellsKnownGain"
        :search="spellSearch"
        :spells="spellCandidates.spells"
        :selected-ids="selectedSpellIds"
        :already-known-ids="alreadyKnownIds"
        :is-loading="spellsLoading"
        :notice="classFallbackNotice(spellCandidates)"
        @update:search="spellSearch = $event"
        @toggle="toggleSpell"
      />

      <!-- Cantrip picker (known casters gaining cantrips) -->
      <LevelUpSpellPicker
        v-if="cantripsKnownGain > 0"
        title="Choose New Cantrips"
        :is-cantrip="true"
        :needed="cantripsKnownGain"
        :search="cantripSearch"
        :spells="cantripCandidates.spells"
        :selected-ids="selectedCantripIds"
        :already-known-ids="alreadyKnownIds"
        :is-loading="spellsLoading"
        :notice="classFallbackNotice(cantripCandidates)"
        @update:search="cantripSearch = $event"
        @toggle="toggleCantrip"
      />

      <!-- The level-up demands picks the library cannot supply. Confirm can
           never enable here, so say why rather than leave a dead button. -->
      <LevelUpSpellsUnavailable
        v-if="blockedOnEmptySpellLibrary"
        :spells-needed="spellCandidates.available === 0 ? spellsKnownGain : 0"
        :cantrips-needed="cantripCandidates.available === 0 ? cantripsKnownGain : 0"
      />

      <!-- Error -->
      <p v-if="error" class="text-body text-destructive">{{ error }}</p>

      <!-- Confirm / Cancel -->
      <div class="flex gap-3">
        <AppButton variant="subtle" size="body" class="flex-1" :to="backRoute ?? '/play/character'" label="Cancel" />
        <AppButton
          variant="primary"
          size="body"
          class="flex-1"
          :disabled="isPending || !canConfirm"
          :label="isPending ? 'Applying…' : `Confirm Level ${nextLevel}`"
          @click="confirm"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import LevelUpChoices from "@/components/features/LevelUpChoices.vue";
import type { ChoiceValue } from "@/components/features/choiceValue";
import LevelUpClassPicker from "./LevelUpClassPicker.vue";
import LevelUpFeaturesGained from "./LevelUpFeaturesGained.vue";
import LevelUpHitPoints from "./LevelUpHitPoints.vue";
import LevelUpSubclassPicker from "./LevelUpSubclassPicker.vue";
import LevelUpSubclassSpells from "./LevelUpSubclassSpells.vue";
import { subclassExpandedSpellIds, subclassVariantDue } from "./subclassSpells";
import { subclassChoiceDue } from "./subclassChoice";
import LevelUpSpellPicker from "./LevelUpSpellPicker.vue";
import LevelUpSpellsUnavailable from "./LevelUpSpellsUnavailable.vue";
import { useLevelUpConfirm } from "./useLevelUpConfirm";
import { isRuleEffectivelyEnabled } from "@/composables/rules/useOptionalRules";
import { useLevelUpSpellSlots } from "./useLevelUpSpellSlots";
import { useClassScopedReset } from "./useClassScopedReset";
import { useLevelUpClassSelection } from "./useLevelUpClassSelection";
import { useLevelUpHitPoints } from "./useLevelUpHitPoints";
import { useLevelUpFeatures } from "./useLevelUpFeatures";
import { classHasSpellcastingProgression } from "./featureGrants";
import { armorTrainingOf } from "./armorTraining";
import { useCharacterSpells } from "@/composables/party/useCharacterSpells";
import { useLevelUpSpellCandidates } from "./useLevelUpSpellCandidates";
import type { PartyMember } from "@/types/party.types";
import { provideCharacterRuleset, useRuleset } from "@/composables/rules/useRuleset";

const props = defineProps<{
  member: PartyMember;
  targetLevel?: number;
  backRoute?: string;
}>();
// Level-up is build rules: the character's own edition, not the table's (useRuleset.ts).
provideCharacterRuleset(() => props.member);
const { ruleset } = useRuleset();

const {
  existingClassOptions, chosenClassSelector, newClassChoiceKey, isAddingNewClass, newClassName,
  newClassDefinition, newClassDefinitionId, newClassDefinitionKind, chosenExistingEntry, memberClass,
  levelInChosenClass, exactClassDefinition, customClass, systemClass, subclassDefinitionId, customSubclass,
  allCustomSubclasses, campaignCustomSubclasses, newClassCandidates, ignoreMulticlassPrereqs, newClassPrereq,
  newClassProficiencyGrants, classRows, campaignRulesData,
} = useLevelUpClassSelection(() => props.member);

// `nextLevel` is the character's new TOTAL level — used for proficiency bonus.
// `levelInChosenClass` is the new level IN THE CLASS BEING LEVELLED — used for
// features, subclass gates, hit die, and class-specific spell/cantrip tables.
const nextLevel = computed(() => props.member.level + 1);
const newProfBonus = computed(() => 2 + Math.floor((nextLevel.value - 1) / 4));

// ── Hit points + hit dice ──────────────────────────────────────────────────────
const hitDie = computed<number | null>(() => (customClass.value ?? systemClass.value)?.hit_die ?? null);
const subclassHpBonus = computed(() => customSubclass.value?.hp_per_level ?? 0);
const {
  conMod, hpAverageValue, hpMode, rolledHp, setHpMode, rollHp, hpGain, currentHitDice, newHitDiceCount,
} = useLevelUpHitPoints({ member: () => props.member, hitDie, subclassHpBonus, nextLevel });

// ── Subclass ───────────────────────────────────────────────────────────────────
const subclassInput = ref("");
const needsSubclassChoice = computed(() =>
  subclassChoiceDue(
    chosenExistingEntry.value,
    levelInChosenClass.value,
    systemClass.value?.subclass_level ?? customClass.value?.subclass_level,
  ),
);
/** The option (a Circle of the Land terrain) the character holds; a subclass picked now starts with none. */
const heldVariant = computed(() =>
  needsSubclassChoice.value ? null : (chosenExistingEntry.value?.subclass_variant ?? null),
);
const subclassVariant = ref("");
const variantDue = computed(() => subclassVariantDue(customSubclass.value, heldVariant.value));
/** What the payload sends: the option asked for now, never one the character already holds. */
const variantPicked = computed(() => (variantDue.value && subclassVariant.value ? subclassVariant.value : null));
/** The grants shown are those of the option the character will hold after this level. */
watch(subclassDefinitionId, () => { subclassVariant.value = ""; });
const subclassOptions = computed(() =>
  campaignCustomSubclasses.value
    .filter((subclass) => subclass.class_name === memberClass.value)
    .map((subclass) => ({ id: subclass.id, name: subclass.subclass_name })),
);
/** The subclass picked at this level, so the features it grants are counted from the first level it has. */
const pickedSubclass = computed(() => {
  if (!needsSubclassChoice.value || !subclassDefinitionId.value) return null;
  const found = (allCustomSubclasses.value ?? []).find((s) => s.id === subclassDefinitionId.value);
  return found ? { name: found.subclass_name, features: found.features } : null;
});

// ── Spell slot computation (multiclass-aware) ──────────────────────────────────
const {
  postLevelupSpellSlots, newSpellSlotSummary, spellsKnownGain, spellsKnownTotal,
  cantripsKnownGain, cantripsKnownTotal, maxCastableLevel,
} = useLevelUpSpellSlots({
  customClass: computed(() => customClass.value ?? null),
  systemClass,
  levelInChosenClass,
  memberClassEntries: existingClassOptions,
  isAddingNewClass,
  newClassName,
  chosenExistingEntry,
  ruleset,
  // "system" default matches the server's coalesce(p_definition_kind,
  // 'system') — see spellPreparationPolicy.ts. Only an exactly-pinned
  // definition may claim "custom", so a custom class sharing an official
  // name never borrows the official policy table.
  definitionKind: computed(() => exactClassDefinition.value?.kind ?? "system"),
});

// ── Features, choices and resources (#976) ─────────────────────────────────────
const choiceValues = ref<Record<string, ChoiceValue>>({});
const swapPicks = ref<Record<string, string>>({});
const choicesComplete = ref(true);
const featsAllowed = computed(
  () => ruleset.value === "2024" || isRuleEffectivelyEnabled(campaignRulesData.value, "feats_2014"),
);

// Armor training comes from the first class: multiclassing grants only some of a second class's.
const armorTraining = computed(() => {
  const first = classRows.value.at(0);
  const list = first ? first.armorProficiencies : (customClass.value ?? systemClass.value)?.armor_proficiencies;
  return armorTrainingOf(list === undefined ? [] : list);
});
const weaponProficiencies = computed(() => {
  const list = (customClass.value ?? systemClass.value)?.weapon_proficiencies;
  return list === undefined ? [] : list;
});

const {
  featuresById, isLoading: featuresLoading, gained, scaling, pools, due, swapOffers, optionContext, resolved, classResources,
  spellVariantFor, featureGrants, featureSpells,
} = useLevelUpFeatures({
  member: () => props.member,
  ruleset,
  rows: classRows,
  chosenRowId: computed(() => chosenExistingEntry.value?.id ?? null),
  newClass: computed(() =>
    isAddingNewClass.value && newClassDefinition.value
      ? { className: newClassName.value, classFeatures: newClassDefinition.value.value.features, startLevels: levelInChosenClass.value }
      : null,
  ),
  pickedSubclass,
  className: memberClass,
  classLevel: levelInChosenClass,
  nextLevel,
  newProfBonus,
  weaponProficiencies,
  canCastSpells: computed(() => postLevelupSpellSlots.value.length > 0),
  classHasSpellcasting: computed(() => classHasSpellcastingProgression(customClass.value ?? systemClass.value)),
  armorProficiencies: armorTraining,
  tashasOn: computed(() => isRuleEffectivelyEnabled(campaignRulesData.value, "tashas_optional_features")),
  values: choiceValues,
  swapPicks,
});

// ── Spell + cantrip candidates ─────────────────────────────────────────────────
// Sourced from the Spellbook's merged library (enabled campaign sources + the
// player's own custom spells). Querying the `spells` table alone — which holds
// only user-authored spells — left both pickers permanently empty (#736).
const spellSearch = ref("");
const cantripSearch = ref("");
const { spellCandidates, cantripCandidates, isLoading: spellsLoading } =
  useLevelUpSpellCandidates({
    className: memberClass, maxCastableLevel, spellSearch, cantripSearch,
    // A 2014 Warlock patron's expanded list is picked from like the class's own.
    extraSpellIds: computed(() =>
      subclassExpandedSpellIds(customSubclass.value, subclassVariant.value || heldVariant.value)),
  });

// Worded without "campaign" on purpose — a standalone player (#730) has none.
function classFallbackNotice(candidates: { usedClassFallback: boolean }): string | undefined {
  if (!candidates.usedClassFallback) return undefined;
  return `No spell in the available sources lists ${memberClass.value}, so the full list is shown.`;
}

/** A required picker with nothing in it — Confirm can never enable. */
const blockedOnEmptySpellLibrary = computed(() => {
  if (spellsLoading.value) return false;
  if (spellsKnownGain.value > 0 && spellCandidates.value.available === 0) return true;
  return cantripsKnownGain.value > 0 && cantripCandidates.value.available === 0;
});

const { data: characterSpells } = useCharacterSpells(computed(() => props.member.id));
const alreadyKnownIds = computed(() => new Set((characterSpells.value ?? []).map((s) => s.spell_id)));

function togglePick(selected: typeof selectedSpellIds, id: string, limit: number) {
  if (alreadyKnownIds.value.has(id)) return;
  if (selected.value.has(id)) {
    const next = new Set(selected.value);
    next.delete(id);
    selected.value = next;
  } else if (selected.value.size < limit) {
    selected.value = new Set([...selected.value, id]);
  }
}
const selectedSpellIds = ref(new Set<string>());
const selectedCantripIds = ref(new Set<string>());
const toggleSpell = (id: string) => togglePick(selectedSpellIds, id, spellsKnownGain.value);
const toggleCantrip = (id: string) => togglePick(selectedCantripIds, id, cantripsKnownGain.value);

// Reset every per-class selection (subclass pin, spell/cantrip picks, feature
// choices) whenever the chosen class changes — otherwise a stale
// subclassDefinitionId from the previous class can travel alongside the new
// class's subclass name, and the server's class-name-mismatch trigger
// (migration 20260720000030) rejects the level-up.
const classIdentityKey = computed(() =>
  isAddingNewClass.value ? `new:${newClassChoiceKey.value}` : `existing:${chosenClassSelector.value}`,
);
useClassScopedReset(classIdentityKey, {
  subclassDefinitionId, subclassInput, subclassVariant, selectedSpellIds, selectedCantripIds, choiceValues, swapPicks,
});

// ── Validation ─────────────────────────────────────────────────────────────────
const canConfirm = computed(() => {
  if (nextLevel.value > 20) return false;
  if (!memberClass.value) return false;
  if (isAddingNewClass.value && !newClassName.value) return false;
  if (isAddingNewClass.value && !ignoreMulticlassPrereqs.value && !newClassPrereq.value.ok) return false;
  if (hitDie.value === null) return false;
  if (hpMode.value === "roll" && rolledHp.value === null) return false;
  // The features are still loading: the picks owed are not known yet.
  if (featuresLoading.value) return false;
  if (!choicesComplete.value) return false;
  // With no subclass defined for this class there is nothing to pick; the
  // level-up goes on and the character is asked again next time.
  if (needsSubclassChoice.value && subclassOptions.value.length > 0 && !subclassDefinitionId.value) return false;
  if (variantDue.value && !subclassVariant.value) return false;
  if (selectedSpellIds.value.size !== spellsKnownGain.value) return false;
  if (selectedCantripIds.value.size !== cantripsKnownGain.value) return false;
  return true;
});

// ── Confirm ────────────────────────────────────────────────────────────────────
const { confirm, error, isPending } = useLevelUpConfirm({
  member: props.member,
  targetLevel: props.targetLevel,
  backRoute: props.backRoute,
  nextLevel,
  newProfBonus,
  hpGain,
  newHitDiceCount,
  postLevelupSpellSlots,
  needsSubclassChoice,
  picks: resolved,
  classResources,
  isAddingNewClass,
  newClassProficiencyGrants,
  memberClass,
  chosenExistingEntry,
  existingClassOptions,
  hpMode,
  rolledHp,
  subclassInput,
  subclassDefinitionId: computed(() => subclassDefinitionId.value || null),
  selectedSpellIds,
  selectedCantripIds,
  newClassName,
  newClassDefinitionId,
  newClassDefinitionKind,
  subclassVariant: variantPicked,
  existingSpellIds: alreadyKnownIds,
  featureGrants,
  featureSpells,
});
</script>
