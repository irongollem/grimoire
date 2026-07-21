<template>
  <div class="space-y-6 max-w-lg mx-auto">
    <!-- Header -->
    <div class="text-center space-y-1">
      <p class="font-cinzel text-xs text-primary tracking-widest uppercase">Level Up</p>
      <h2 class="font-cinzel text-2xl font-bold text-foreground">
        {{ member.name }}
        <span class="text-muted-foreground">→ Level {{ nextLevel }}</span>
      </h2>
      <p v-if="member.class" class="font-fell text-sm text-muted-foreground italic">{{ member.class }}</p>
      <!-- Multi-level progress indicator -->
      <div v-if="targetLevel && targetLevel > nextLevel" class="flex items-center justify-center gap-1 mt-2 flex-wrap">
        <template v-for="lvl in (targetLevel - member.level)" :key="lvl">
          <span class="font-cinzel text-2xs px-1.5 py-0.5 rounded"
            :class="lvl === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'">
            {{ member.level + lvl }}
          </span>
          <span v-if="lvl < (targetLevel - member.level)" class="text-muted-foreground/40 text-xs">→</span>
        </template>
        <span class="font-cinzel text-2xs text-muted-foreground ml-1">({{ nextLevel - member.level }} of {{ targetLevel - member.level }})</span>
      </div>
    </div>

    <!-- Max level guard -->
    <div v-if="nextLevel > 20" class="rounded-lg border border-border bg-card p-6 text-center">
      <p class="font-cinzel text-sm text-muted-foreground">{{ member.name }} has already reached level 20.</p>
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

      <!-- Features gained -->
      <LevelUpFeaturesGained
        :features="customFeaturesForLevel"
        :expanded-features="wizardExpandedFeatures"
        :has-class-data="!!(systemClass || customClass)"
        :next-level="nextLevel"
        :class-name="memberClass || (member.class ?? 'this class')"
        :cantrips-known-gain="cantripsKnownGain"
        :cantrips-known-total="cantripsKnownTotal"
        :spells-known-gain="spellsKnownGain"
        :spells-known-total="spellsKnownTotal"
        :resource-notices="resourceNotices"
        :prof-bonus-bumped="newProfBonus !== member.proficiency_bonus"
        :new-prof-bonus="newProfBonus"
        :spell-slot-summary="newSpellSlotSummary"
        @toggle-feature="toggleWizardFeature"
      />

      <!-- Hit Points -->
      <LevelUpHitPoints
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

      <!-- ASI / Feat picker -->
      <LevelUpAsiSection
        v-if="grantsAsi"
        v-model:asi-mode="asiMode"
        v-model:asi-primary="asiPrimary"
        v-model:asi-secondary="asiSecondary"
        :asi-preview="asiPreview"
        v-model:feat-search="featSearch"
        v-model:feat-id="featId"
        :filtered-feats="filteredFeats"
        :selected-feat-name="selectedFeatName"
      />

      <!-- Subclass choice -->
      <LevelUpSubclassPicker
        v-if="needsSubclassChoice"
        v-model="subclassInput"
        v-model:selected-id="subclassDefinitionId"
        :next-level="nextLevel"
        :class-name="memberClass"
        :subclass-options="subclassOptions"
      />

      <!-- Class-specific steps -->
      <LevelUpClassSteps
        :steps="classSteps"
        :single-values="stepValues"
        :multi-values="stepMultiValues"
        :existing-choices="member.class_choices"
        @update:single-values="stepValues = $event"
        @update:multi-values="stepMultiValues = $event"
      />

      <!-- Spell picker (known casters gaining spells) -->
      <LevelUpSpellPicker
        v-if="spellsKnownGain > 0"
        title="Choose New Spells"
        :is-cantrip="false"
        :needed="spellsKnownGain"
        :search="spellSearch"
        :spells="filteredSpells"
        :selected-ids="selectedSpellIds"
        :already-known-ids="alreadyKnownIds"
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
        :spells="cantripPageData?.spells ?? []"
        :selected-ids="selectedCantripIds"
        :already-known-ids="alreadyKnownIds"
        @update:search="cantripSearch = $event"
        @toggle="toggleCantrip"
      />

      <!-- Error -->
      <p v-if="error" class="font-fell text-sm text-destructive">{{ error }}</p>

      <!-- Confirm / Cancel -->
      <div class="flex gap-3">
        <RouterLink :to="backRoute ?? '/play'"
          class="flex-1 rounded-md border border-border px-4 py-2 font-cinzel text-xs text-muted-foreground text-center tracking-wider hover:text-foreground hover:border-primary/40 transition-colors">
          Cancel
        </RouterLink>
        <button
          class="flex-1 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="isPending || !canConfirm"
          @click="confirm">
          {{ isPending ? "Applying…" : `Confirm Level ${nextLevel}` }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { RouterLink } from "vue-router";
import LevelUpClassPicker from "./LevelUpClassPicker.vue";
import LevelUpFeaturesGained from "./LevelUpFeaturesGained.vue";
import LevelUpHitPoints from "./LevelUpHitPoints.vue";
import LevelUpAsiSection from "./LevelUpAsiSection.vue";
import LevelUpSubclassPicker from "./LevelUpSubclassPicker.vue";
import LevelUpSpellPicker from "./LevelUpSpellPicker.vue";
import LevelUpClassSteps from "./LevelUpClassSteps.vue";
import { useLevelUpConfirm } from "./useLevelUpConfirm";
import { useAllCustomSubclasses } from "@/composables/useCustomSubclasses";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import {
  useCharacterClasses,
  useMulticlassPrereqs,
} from "@/composables/useCharacterClasses";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";
import { meetsMulticlassPrereq } from "@/types/multiclass.types";
import type { CharacterClass } from "@/types/multiclass.types";
import { getHitDie } from "@/types/spell.types";
import { useLevelUpSpellSlots } from "./useLevelUpSpellSlots";
import { useClassScopedReset } from "./useClassScopedReset";
import type { DieSize } from "@/lib/dice";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { useAllFeatures } from "@/composables/useFeatures";
import { useCharacterSpells } from "@/composables/useCharacterSpells";
import { useSpellsPage } from "@/composables/useSpells";
import type { PartyMember } from "@/types/party.types";
import type { AbilityKey, AsiMode, ClassStep, ClassResourceDef, FeatureEntry } from "./types";
import { mapFeatureIds } from "./types";
import type { CustomResource } from "@/levelup/customTypes";
import { useRuleset } from "@/composables/useRuleset";

const props = defineProps<{
  member: PartyMember;
  targetLevel?: number;
  backRoute?: string;
}>();
const { ruleset } = useRuleset();

// ── Multiclass state ───────────────────────────────────────────────────────────
const memberIdRef = computed(() => props.member.id);
const { data: characterClasses } = useCharacterClasses(memberIdRef);
const { data: multiclassPrereqs } = useMulticlassPrereqs();
const { data: allCustomClasses } = useAllCustomClasses();
const { data: allSystemClasses } = useAllSystemClasses();

const memberClassEntries = computed<CharacterClass[]>(() => characterClasses.value ?? []);

const existingClassOptions = computed(() => memberClassEntries.value);

/** User's choice for this level-up: either an existing class entry or "__new__" */
const chosenClassSelector = ref<string>("");

/** When adding a new class, which class is being taken. */
const newClassChoiceKey = ref<string>("");

// Seed the picker on mount / when member classes load. Must be a watch — a
// lazy computed that is never read in the template would never run, leaving
// chosenClassSelector "" and silently skipping the character_classes update
// on confirm.
watch(
  existingClassOptions,
  (options) => {
    if (chosenClassSelector.value) return;
    const primary = options.find(c => c.is_primary) ?? options[0];
    if (primary) chosenClassSelector.value = primary.id;
  },
  { immediate: true },
);

const isAddingNewClass = computed(() => chosenClassSelector.value === "__new__");

const newClassDefinition = computed(() => {
  const [kind, id] = newClassChoiceKey.value.split(":");
  if (kind === "system") return (allSystemClasses.value ?? []).find(c => c.id === id)
    ? { kind: "system" as const, value: (allSystemClasses.value ?? []).find(c => c.id === id)! } : null;
  if (kind === "custom") return (allCustomClasses.value ?? []).find(c => c.id === id)
    ? { kind: "custom" as const, value: (allCustomClasses.value ?? []).find(c => c.id === id)! } : null;
  return null;
});
const newClassName = computed(() => newClassDefinition.value?.value.class_name ?? "");
const newClassDefinitionId = computed(() => newClassDefinition.value?.value.id ?? null);
const newClassDefinitionKind = computed(() => newClassDefinition.value?.kind ?? null);

const chosenExistingEntry = computed<CharacterClass | null>(() => {
  if (isAddingNewClass.value) return null;
  return existingClassOptions.value.find(c => c.id === chosenClassSelector.value) ?? null;
});

/** The class name for this level-up — existing-class name or newly-picked class. */
const memberClass = computed(() => {
  if (isAddingNewClass.value) return newClassName.value;
  return chosenExistingEntry.value?.class_name ?? props.member.class ?? "";
});

const memberSubclass = computed(() =>
  chosenExistingEntry.value?.subclass_name ?? "",
);

/** Per-chosen-class level: the level *inside the chosen class* after this bump. */
const levelInChosenClass = computed(() => {
  if (isAddingNewClass.value) return 1;
  if (chosenExistingEntry.value) return chosenExistingEntry.value.levels + 1;
  // DM-built character with no character_classes rows yet (existingClassOptions
  // is empty, so chosenExistingEntry never resolves) — derive the level being
  // gained from the legacy party_members.level field instead of defaulting to 1.
  if (existingClassOptions.value.length === 0 && props.member.class) return props.member.level + 1;
  return 1;
});

const exactClassDefinition = computed(() => {
  if (isAddingNewClass.value) return newClassDefinition.value;
  const entry = chosenExistingEntry.value;
  if (entry?.class_definition_kind === "system" && entry.class_definition_id) {
    const value = (allSystemClasses.value ?? []).find(c => c.id === entry.class_definition_id);
    if (value) return { kind: "system" as const, value };
  }
  if (entry?.class_definition_kind === "custom" && entry.class_definition_id) {
    const value = (allCustomClasses.value ?? []).find(c => c.id === entry.class_definition_id);
    if (value) return { kind: "custom" as const, value };
  }
  return null;
});
const customClass = computed(() => exactClassDefinition.value
  ? (exactClassDefinition.value.kind === "custom" ? exactClassDefinition.value.value : null)
  : (allCustomClasses.value ?? []).find(c => c.class_name === memberClass.value));
const systemClass = computed(() => exactClassDefinition.value
  ? (exactClassDefinition.value.kind === "system" ? exactClassDefinition.value.value : undefined)
  : (allSystemClasses.value ?? []).find(c => c.class_name === memberClass.value));
const { data: allFeatures }   = useAllFeatures();
const { data: allCustomSubclasses } = useAllCustomSubclasses();
const subclassDefinitionId = ref("");
const customSubclass = computed(() => {
  const id = subclassDefinitionId.value || chosenExistingEntry.value?.subclass_definition_id;
  if (id) return (allCustomSubclasses.value ?? []).find(subclass => subclass.id === id) ?? null;
  return (allCustomSubclasses.value ?? []).find(subclass =>
    subclass.class_name === memberClass.value && subclass.subclass_name === memberSubclass.value) ?? null;
});

// Classes the character doesn't already have — candidates for a new level.
const newClassCandidates = computed(() => {
  const existing = new Set(existingClassOptions.value.map(c => c.class_name));
  return [
    ...(allSystemClasses.value ?? []).map(c => ({ key: `system:${c.id}`, className: c.class_name, label: `${c.class_name} — Official` })),
    ...(allCustomClasses.value ?? []).map(c => ({ key: `custom:${c.id}`, className: c.class_name,
      label: `${c.class_name} — ${c.source_document_key ? "Imported" : "Custom"}${c.source_revision ? ` (${c.source_revision})` : ""}` })),
  ].filter(candidate => !existing.has(candidate.className))
    .sort((a, b) => a.label.localeCompare(b.label));
});

const { data: campaignRulesData } = useOptionalRules();
const ignoreMulticlassPrereqs = computed<boolean>(() =>
  isRuleEffectivelyEnabled(campaignRulesData.value, "ignore_multiclass_prereqs"),
);

/** Prereq check for the currently-selected new class. */
const newClassPrereq = computed(() => {
  if (!isAddingNewClass.value || !newClassName.value) return { ok: true as const };
  const prereq = (multiclassPrereqs.value ?? []).find(p => p.class_name === newClassName.value);
  if (!prereq) return { ok: true as const };
  return meetsMulticlassPrereq(prereq, {
    str: props.member.str, dex: props.member.dex, con: props.member.con,
    int: props.member.int, wis: props.member.wis, cha: props.member.cha,
  });
});

const newClassProficiencyGrants = computed<string[]>(() => {
  if (!isAddingNewClass.value || !newClassName.value) return [];
  const prereq = (multiclassPrereqs.value ?? []).find(p => p.class_name === newClassName.value);
  return prereq?.gained_proficiencies ?? [];
});

// ── Derived ────────────────────────────────────────────────────────────────────
// `nextLevel` is the character's new TOTAL level — used for proficiency bonus.
// `levelInChosenClass` (defined above) is the new level IN THE CLASS BEING
// LEVELLED — used for features, ASI checks, subclass gates, hit die, and
// class-specific spell/cantrip tables.
const nextLevel    = computed(() => props.member.level + 1);
const newProfBonus = computed(() => 2 + Math.floor((nextLevel.value - 1) / 4));

// ── Hit points + hit dice ──────────────────────────────────────────────────────
const hitDie = computed<number>(() => {
  const cls = customClass.value ?? systemClass.value;
  return cls?.hit_die ?? getHitDie(memberClass.value);
});
const conMod = computed(() => Math.floor((props.member.con - 10) / 2));
const hpAverageValue = computed(() => Math.ceil(hitDie.value / 2) + 1);

type HpMode = "average" | "roll" | "max";
const hpMode = ref<HpMode>("average");
const rolledHp = ref<number | null>(null);

function setHpMode(mode: HpMode) {
  if (hpMode.value === mode) return;
  hpMode.value = mode;
  // Clear any locked roll so switching to "roll" re-exposes the button.
  rolledHp.value = null;
}

const { promptRoll } = usePromptedRoll();

async function rollHp() {
  if (rolledHp.value !== null) return;
  const r = await promptRoll({
    counts: { [hitDie.value as DieSize]: 1 },
    modifier: 0,
    label: `Hit Die (1d${hitDie.value})`,
    silent: true,
  });
  if (r) rolledHp.value = r.total;
}

const subclassHpBonus = computed(() => customSubclass.value?.hp_per_level ?? 0);

/** HP gained at this level-up. Minimum 1 per 5e guidance (no negative levels). */
const hpGain = computed(() => {
  const bonus = subclassHpBonus.value;
  if (hpMode.value === "roll") {
    if (rolledHp.value === null) return 0;
    return Math.max(1, rolledHp.value + conMod.value + bonus);
  }
  if (hpMode.value === "max") return Math.max(1, hitDie.value + conMod.value + bonus);
  return Math.max(1, hpAverageValue.value + conMod.value + bonus);
});

const currentHitDice = computed(() =>
  Math.min(props.member.level, props.member.hit_dice_remaining ?? props.member.level),
);
const newHitDiceCount = computed(() => Math.min(nextLevel.value, currentHitDice.value + 1));

const grantsAsi = computed(() =>
  systemClass.value?.asi_levels.includes(levelInChosenClass.value) ||
  customClass.value?.asi_levels.includes(levelInChosenClass.value) ||
  false,
);

const needsSubclassChoice = computed(() => {
  if (chosenExistingEntry.value?.subclass_name) return false;
  if (systemClass.value?.subclass_level === levelInChosenClass.value) return true;
  if (customClass.value?.subclass_level === levelInChosenClass.value) return true;
  return false;
});

const subclassOptions = computed(() => (allCustomSubclasses.value ?? [])
  .filter(subclass => subclass.class_name === memberClass.value)
  .map(subclass => ({
    id: subclass.id,
    name: subclass.subclass_name,
    label: `${subclass.subclass_name} — ${subclass.source_document_key ? "Imported" : "Custom"}${subclass.source_revision ? ` (${subclass.source_revision})` : ""}`,
  })));

// ── Spell slot computation (multiclass-aware) ──────────────────────────────────
const {
  prevLevelInChosenClass,
  postLevelupSpellSlots,
  newSpellSlotSummary,
  spellsKnownGain,
  spellsKnownTotal,
  cantripsKnownGain,
  cantripsKnownTotal,
  maxCastableLevel,
} = useLevelUpSpellSlots({
  customClass: computed(() => customClass.value ?? null),
  systemClass,
  levelInChosenClass,
  memberClassEntries,
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

const wizardExpandedFeatures = ref(new Set<string>());
function toggleWizardFeature(name: string) {
  if (wizardExpandedFeatures.value.has(name)) wizardExpandedFeatures.value.delete(name);
  else wizardExpandedFeatures.value.add(name);
  wizardExpandedFeatures.value = new Set(wizardExpandedFeatures.value);
}

const featureObjectMap = computed(() => new Map((allFeatures.value ?? []).map(f => [f.id, f])));

const customFeaturesForLevel = computed<FeatureEntry[]>(() => {
  // Features are indexed per-class-level, not per-total-level.
  const lvlKey = levelInChosenClass.value.toString();
  const ids = customSubclass.value?.features[lvlKey] ?? customClass.value?.features[lvlKey] ?? systemClass.value?.features[lvlKey] ?? [];
  return mapFeatureIds(ids, featureObjectMap.value);
});

function resourceDefsFrom(resources: CustomResource[]): ClassResourceDef[] {
  return resources.map(r => ({
    key: r.key,
    label: r.label,
    rest: r.rest,
    maxAtLevel: (level: number) => {
      if (r.scaling === "fixed") return r.fixed_value ?? 0;
      if (r.scaling === "per_level") return level;
      if (r.scaling === "table" && r.table_values) return r.table_values[Math.min(level, 20) - 1] ?? 0;
      return 0;
    },
  }));
}

const classDefs = computed<ClassResourceDef[]>(() => {
  const all = [
    ...resourceDefsFrom(systemClass.value?.resources ?? []),
    ...resourceDefsFrom(customClass.value?.resources ?? []),
    ...resourceDefsFrom(customSubclass.value?.resources ?? []),
  ];
  const seenKeys = new Set<string>();
  return all.filter(d => { if (seenKeys.has(d.key)) return false; seenKeys.add(d.key); return true; });
});

const resourceNotices = computed(() =>
  classDefs.value.flatMap(def => {
    const newMax = def.maxAtLevel(levelInChosenClass.value);
    const oldMax = def.maxAtLevel(prevLevelInChosenClass.value);
    if (newMax === oldMax) return [];
    return [{ key: def.key, label: def.label, oldMax, newMax }];
  }),
);

// ── ASI ────────────────────────────────────────────────────────────────────────
const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};

const asiMode      = ref<AsiMode>("plus2");
const asiPrimary   = ref<AbilityKey | "">("");
const asiSecondary = ref<AbilityKey | "">("");

const asiPreview = computed(() => {
  const lines: string[] = [];
  if (asiPrimary.value) {
    const cur = props.member[asiPrimary.value as keyof PartyMember] as number;
    lines.push(`${ABILITY_LABEL[asiPrimary.value]} ${cur} → ${cur + (asiMode.value === "plus2" ? 2 : 1)}`);
  }
  if (asiMode.value === "plus1plus1" && asiSecondary.value && asiSecondary.value !== asiPrimary.value) {
    const cur = props.member[asiSecondary.value as keyof PartyMember] as number;
    lines.push(`${ABILITY_LABEL[asiSecondary.value]} ${cur} → ${cur + 1}`);
  }
  return lines;
});

// ── Feat picker ────────────────────────────────────────────────────────────────
const featSearch = ref("");
const featId     = ref("");
const filteredFeats = computed(() => {
  const term = featSearch.value.toLowerCase().trim();
  return (allFeatures.value ?? []).filter(f => !term || f.name.toLowerCase().includes(term));
});
const selectedFeatName = computed(() => allFeatures.value?.find(f => f.id === featId.value)?.name ?? "");

// ── Subclass ───────────────────────────────────────────────────────────────────
const subclassInput = ref("");

// ── Class-specific steps ───────────────────────────────────────────────────────
const classSteps = computed<ClassStep[]>(() => {
  function stepsAt(steps: { level: number; step_type: string; type: "select" | "append"; key: string; label: string; description?: string; options: string[]; count?: number }[]): ClassStep[] {
    return steps
      .filter(s => s.level === levelInChosenClass.value)
      .map(({ level: _l, step_type: _st, ...rest }) => rest);
  }
  return [
    ...stepsAt(systemClass.value?.steps ?? []),
    ...stepsAt(customClass.value?.steps ?? []),
    ...stepsAt(customSubclass.value?.steps ?? []),
  ];
});

const stepValues = ref<Record<string, string>>({});
const stepMultiValues = ref<Record<string, string[]>>({});

// ── Spell picker ───────────────────────────────────────────────────────────────
const spellSearch = ref("");
const spellFilters = computed(() => ({
  search: spellSearch.value,
  level: "",
  school: "",
  class: memberClass.value,
  source: "",
}));
const spellPage = ref(0);
const { data: spellPageData } = useSpellsPage(spellFilters, spellPage);
/** Only show spells the character can actually cast (level ≤ max slot level). */
const filteredSpells = computed(() =>
  (spellPageData.value?.spells ?? []).filter(s => s.level > 0 && s.level <= maxCastableLevel.value),
);

const { data: characterSpells } = useCharacterSpells(computed(() => props.member.id));
const alreadyKnownIds = computed(() => new Set((characterSpells.value ?? []).map(s => s.spell_id)));

const selectedSpellIds = ref(new Set<string>());
function toggleSpell(id: string) {
  if (alreadyKnownIds.value.has(id)) return;
  if (selectedSpellIds.value.has(id)) {
    const next = new Set(selectedSpellIds.value);
    next.delete(id);
    selectedSpellIds.value = next;
  } else if (selectedSpellIds.value.size < spellsKnownGain.value) {
    selectedSpellIds.value = new Set([...selectedSpellIds.value, id]);
  }
}

// ── Cantrip picker ─────────────────────────────────────────────────────────────
const cantripSearch = ref("");
const cantripFilters = computed(() => ({
  search: cantripSearch.value,
  level: "0",
  school: "",
  class: memberClass.value,
  source: "",
}));
const cantripPage = ref(0);
const { data: cantripPageData } = useSpellsPage(cantripFilters, cantripPage);

const selectedCantripIds = ref(new Set<string>());
function toggleCantrip(id: string) {
  if (alreadyKnownIds.value.has(id)) return;
  if (selectedCantripIds.value.has(id)) {
    const next = new Set(selectedCantripIds.value);
    next.delete(id);
    selectedCantripIds.value = next;
  } else if (selectedCantripIds.value.size < cantripsKnownGain.value) {
    selectedCantripIds.value = new Set([...selectedCantripIds.value, id]);
  }
}

// Reset every per-class selection (subclass pin, spell/cantrip picks, class
// steps) whenever the chosen class changes — otherwise a stale
// subclassDefinitionId from the previous class can travel alongside the new
// class's subclass name, and the server's class-name-mismatch trigger
// (migration 20260720000030) rejects the level-up.
const classIdentityKey = computed(() =>
  isAddingNewClass.value ? `new:${newClassChoiceKey.value}` : `existing:${chosenClassSelector.value}`,
);
useClassScopedReset(classIdentityKey, {
  subclassDefinitionId, subclassInput, selectedSpellIds, selectedCantripIds, stepValues, stepMultiValues,
});

// ── Validation ─────────────────────────────────────────────────────────────────
const canConfirm = computed(() => {
  if (nextLevel.value > 20) return false;
  if (!memberClass.value) return false;
  if (isAddingNewClass.value && !newClassName.value) return false;
  if (isAddingNewClass.value && !ignoreMulticlassPrereqs.value && !newClassPrereq.value.ok) return false;
  if (hpMode.value === "roll" && rolledHp.value === null) return false;
  if (grantsAsi.value) {
    if (asiMode.value === "plus2" && !asiPrimary.value) return false;
    if (asiMode.value === "plus1plus1" && (!asiPrimary.value || !asiSecondary.value || asiSecondary.value === asiPrimary.value)) return false;
    if (asiMode.value === "feat" && !featId.value) return false;
  }
  if (needsSubclassChoice.value && !subclassInput.value.trim()) return false;
  for (const step of classSteps.value) {
    const count = step.count ?? 1;
    if (count > 1) {
      if ((stepMultiValues.value[step.key] ?? []).filter(Boolean).length < count) return false;
    } else {
      if (!stepValues.value[step.key]) return false;
    }
  }
  if (selectedSpellIds.value.size !== spellsKnownGain.value) return false;
  if (selectedCantripIds.value.size !== cantripsKnownGain.value) return false;
  return true;
});

// ── Confirm ────────────────────────────────────────────────────────────────────
// Spells the leveled subclass grants (always prepared) at the new in-class
// level. Resolve the effective subclass: a just-chosen one (subclassInput) at
// the subclass-choice level, otherwise the existing subclass on the leveled class.
const grantedSpellsForThisLevel = computed<string[]>(() => {
  const effectiveSubclass =
    needsSubclassChoice.value && subclassInput.value.trim()
      ? subclassInput.value.trim()
      : memberSubclass.value;
  if (!effectiveSubclass) return [];
  const sub = customSubclass.value?.subclass_name === effectiveSubclass
    ? customSubclass.value
    : (allCustomSubclasses.value ?? []).find(
      (cs) => cs.class_name === memberClass.value && cs.subclass_name === effectiveSubclass,
    );
  return sub?.granted_spells?.[String(levelInChosenClass.value)] ?? [];
});

const { confirm, error, isPending } = useLevelUpConfirm({
  member: props.member,
  targetLevel: props.targetLevel,
  backRoute: props.backRoute,
  nextLevel,
  newProfBonus,
  hpGain,
  newHitDiceCount,
  postLevelupSpellSlots,
  grantsAsi,
  needsSubclassChoice,
  classDefs,
  levelInChosenClass,
  classSteps,
  isAddingNewClass,
  newClassProficiencyGrants,
  memberClass,
  chosenExistingEntry,
  existingClassOptions,
  hpMode,
  rolledHp,
  asiMode,
  asiPrimary,
  asiSecondary,
  featId,
  subclassInput,
  subclassDefinitionId: computed(() => subclassDefinitionId.value || null),
  stepValues,
  stepMultiValues,
  selectedSpellIds,
  selectedCantripIds,
  newClassName,
  newClassDefinitionId,
  newClassDefinitionKind,
  grantedSpellsForThisLevel,
  existingSpellIds: alreadyKnownIds,
});
</script>
