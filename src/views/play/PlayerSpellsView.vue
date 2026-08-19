<template>
  <div class="space-y-4 pb-8">
    <RulesetReviewBanner
      v-if="rulesetReviewClasses.length"
      link-to="/codex/classes"
      link-label="Compare classes"
      ack-label="Keep current choices"
      :acknowledging="acknowledgingRulesetReview"
      @acknowledge="acknowledgeRulesetReview"
    >
      The campaign rules changed. Review {{ rulesetReviewClasses.map(entry => entry.label).join(", ") }} before changing its spells.
    </RulesetReviewBanner>
    <RulesetReviewBanner
      v-if="rulesetReviewSpells.length"
      link-to="/spells"
      link-label="Compare spells"
      ack-label="Keep current versions"
      :acknowledging="acknowledgingSpellRulesetReview"
      @acknowledge="acknowledgeSpellRulesetReview"
    >
      No safe {{ ruleset }} counterpart was found for {{ rulesetReviewSpells.map(entry => entry.spell.name).join(", ") }}.
      Review the spell text before play.
    </RulesetReviewBanner>
    <div v-if="legacySpells.length" class="rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 space-y-2">
      <p class="text-label-lg font-bold text-amber-500">Review legacy spell sources</p>
      <p class="text-body text-muted-foreground">These spells predate multiclass source tracking. Assign each one before changing its preparation.</p>
      <div v-for="entry in legacySpells" :key="entry.id" class="flex items-center gap-3">
        <span class="text-body flex-1">{{ entry.spell.name }}</span>
        <select
          class="bg-card border border-border rounded px-2 py-1 text-sm"
          :disabled="isAssigningSource"
          @change="assignLegacySource(entry.id, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">Choose source class…</option>
          <option v-for="choice in sourceChoicesFor(entry.spell)" :key="choice.id" :value="choice.id">{{ choice.class_name }}</option>
        </select>
      </div>
    </div>
    <!-- Tab switcher -->
    <div class="flex gap-1 w-fit">
      <AppButton
        v-for="tab in tabs"
        :key="tab.id"
        variant="subtle"
        size="sm"
        :active="activeTab === tab.id"
        @click="selectTab(tab.id)"
      >
        {{ tab.label }}
        <span
          v-if="tab.count != null && tab.count > 0"
          class="ml-1.5 px-1.5 py-0.5 rounded-full text-2xs md:text-sm"
          :class="[
            activeTab === tab.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
            tab.max != null && tab.count > tab.max ? 'bg-destructive/20! text-destructive!' : ''
          ]"
        >{{ tab.count }}{{ tab.max != null ? ` / ${tab.max}` : '' }}{{ tab.cantrips != null ? ` + ${tab.cantrips}${tab.maxCantrips != null ? `/${tab.maxCantrips}` : ''}C` : '' }}</span>
      </AppButton>
    </div>

    <!-- Prepared tab -->
    <PlayerMySpells
      v-if="activeTab === 'prepared'"
      :party-member-id="resolvedMemberId"
      :caster-type="casterType"
      :member-class="memberClass"
      :member-name="memberName"
      :spell-slots="effectiveSpellSlots"
      :spell-attack-bonus="spellAttackBonus"
      :spell-save-dc="spellSaveDc"
      :spellcasting-by-class="spellcastingByClass"
      :max-prepared="maxPrepared"
      :member-level="memberLevel"
      :sorcerer-level="sorcererLevel"
      view-mode="prepared"
    />

    <!-- Spellbook / Known tab -->
    <PlayerMySpells
      v-else-if="activeTab === 'spellbook'"
      :party-member-id="resolvedMemberId"
      :caster-type="casterType"
      :member-class="memberClass"
      :member-name="memberName"
      :spell-slots="effectiveSpellSlots"
      :spell-attack-bonus="spellAttackBonus"
      :spell-save-dc="spellSaveDc"
      :spellcasting-by-class="spellcastingByClass"
      :max-prepared="maxPrepared"
      :sorcerer-level="sorcererLevel"
      view-mode="spellbook"
    />

    <!-- Innate tab -->
    <template v-else-if="activeTab === 'innate'">
      <div class="flex justify-end mb-2">
        <AppButton
          variant="tinted"
          tone="arcane"
          size="sm"
          :icon="IconGenerate"
          label="Add Innate Spell"
          @click="addInnateOpen = true"
        />
      </div>
      <PlayerInnateSpells
        :party-member-id="resolvedMemberId"
        :member-name="memberName"
        :spell-attack-bonus="spellAttackBonus"
        :spell-save-dc="spellSaveDc"
      />
      <AddInnateSpellDialog
        :open="addInnateOpen"
        :party-member-id="resolvedMemberId"
        @close="addInnateOpen = false"
      />
    </template>

    <!-- All Spells browse tab -->
    <template v-else-if="activeTab === 'browse'">
      <div class="flex flex-wrap items-center gap-2">
        <!-- IconSearch -->
        <div class="relative flex-1 min-w-48">
          <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="ui.playerSpellsSearch"
            type="text"
            placeholder="Search by name…"
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <!-- Level -->
        <SegmentedControl
          :model-value="ui.playerSpellsLevelFilter"
          :options="LEVEL_FILTERS"
          @update:model-value="setLevelFilter"
        />
        <!-- School -->
        <AppSelect v-model="ui.playerSpellsSchoolFilter">
          <option value="">All Schools</option>
          <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
        </AppSelect>
        <!-- Class -->
        <AppSelect v-model="ui.playerSpellsClassFilter">
          <option v-for="c in availableSpellClasses" :key="c" :value="c">{{ c }}</option>
        </AppSelect>
        <AppButton
          v-if="ui.playerSpellsHasActiveFilters"
          variant="subtle"
          size="sm"
          label="Clear"
          class="shrink-0"
          @click="ui.resetPlayerSpellsFilters()"
        />
      </div>

      <SpellList
        :search="search"
        :level-filter="ui.playerSpellsLevelFilter"
        :school-filter="ui.playerSpellsSchoolFilter"
        :class-filter="ui.playerSpellsClassFilter"
        :source-filter="'all'"
        :player-member-id="resolvedMemberId ?? undefined"
        :caster-type="browseCasterType"
        :known-spell-ids="browseKnownSpellIds"
        :prepared-spell-ids="browsePreparedSpellIds"
        :source-class-id="browseSourceClassId"
        :source-class-level="browseClassEntry?.levels ?? member?.level ?? 1"
        :known-cantrip-count="browseKnownCantripCount"
        :prepared-spell-count="browsePreparedSpellCount"
        :official-rules-policy="!!browsePolicy"
        @spell-click="selectedSpell = $event"
      />
    </template>
  </div>

  <PlayerSpellModal :spell="selectedSpell" @close="selectedSpell = null" />
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { refDebounced } from "@vueuse/core";
import { IconGenerate, IconSearch } from '@/lib/icons';
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/useParty";
import { useAssignCharacterSpellSource, useCharacterSpells, useCharacterSpellsWithDetails } from "@/composables/useCharacterSpells";
import SpellList from "@/components/spells/SpellList.vue";
import PlayerMySpells from "@/components/spells/PlayerMySpells.vue";
import PlayerInnateSpells from "@/components/spells/PlayerInnateSpells.vue";
import AddInnateSpellDialog from "@/components/spells/AddInnateSpellDialog.vue";
import PlayerSpellModal from "@/components/spells/PlayerSpellModal.vue";
import RulesetReviewBanner from "@/components/common/RulesetReviewBanner.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import type { Spell } from "@/types/spell.types";
import { SPELL_SCHOOLS, getCasterType, computeMaxPrepared } from "@/types/spell.types";
import { useCharacterClasses } from "@/composables/useCharacterClasses";
import { useAllCustomClasses, useAllSystemClasses } from "@/composables/useCustomClasses";
import { computeSpellcastingByClass } from "@/rules/spellcastingByClass";
import { useRuleset } from "@/composables/useRuleset";
import { getSpellPreparationPolicy, policyValueAtLevel } from "@/rules/spellPreparationPolicy";
import { deriveEffectiveSpellSlots } from "@/rules/spellSlots";
import { useRulesetReviews, useAcknowledgeRulesetReviews } from "@/composables/useRulesetReviews";
import { useToast } from "@/composables/useToast";

const addInnateOpen = ref(false);

const selectedSpell = ref<Spell | null>(null);

const LEVEL_FILTERS = [
  { value: "", label: "All" },
  { value: "0", label: "C" },
  { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" },
  { value: "4", label: "4" }, { value: "5", label: "5" }, { value: "6", label: "6" },
  { value: "7", label: "7" }, { value: "8", label: "8" }, { value: "9", label: "9" },
];

const auth = useAuthStore();
const ui = useUiStore();
const { ruleset } = useRuleset();
const { data: partyMembers } = useParty();

const resolvedMemberId = computed(() =>
  ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId,
);

const memberClass = computed(() => {
  const id = resolvedMemberId.value;
  if (!id || !partyMembers.value) return "";
  return partyMembers.value.find((m) => m.id === id)?.class ?? "";
});

const { data: characterClasses } = useCharacterClasses(resolvedMemberId);
const { data: rulesetReviews } = useRulesetReviews(resolvedMemberId);
const rulesetReviewClasses = computed(() => {
  const flaggedIds = new Set(
    (rulesetReviews.value ?? [])
      .filter((r) => r.flag_type === "class" || r.flag_type === "subclass")
      .map((r) => r.character_class_id)
      .filter((id): id is string => !!id),
  );
  return (characterClasses.value ?? [])
    .filter((entry) => flaggedIds.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      label: entry.subclass_name ? `${entry.class_name} (${entry.subclass_name})` : entry.class_name,
    }));
});
const queryClient = useQueryClient();
const toast = useToast();
const { mutateAsync: acknowledgeRulesetReviews } = useAcknowledgeRulesetReviews();
const acknowledgingRulesetReview = ref(false);
async function acknowledgeRulesetReview() {
  if (!rulesetReviewClasses.value.length || acknowledgingRulesetReview.value || !resolvedMemberId.value) return;
  acknowledgingRulesetReview.value = true;
  try {
    await acknowledgeRulesetReviews({ partyMemberId: resolvedMemberId.value, flagTypes: ["class", "subclass"] });
    await queryClient.invalidateQueries({ queryKey: ["character_classes", resolvedMemberId.value] });
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't acknowledge the rule change."));
  } finally {
    acknowledgingRulesetReview.value = false;
  }
}
const { data: allSystemClasses } = useAllSystemClasses();
const { data: allCustomClasses } = useAllCustomClasses();
const member      = computed(() => partyMembers.value?.find((m) => m.id === resolvedMemberId.value) ?? null);
const memberClassEntry = computed(() =>
  (characterClasses.value ?? []).find((entry) => entry.class_name === memberClass.value),
);
function definitionFor(entry: typeof memberClassEntry.value, fallbackName = "") {
  if (entry?.class_definition_kind === "system" && entry.class_definition_id) {
    return (allSystemClasses.value ?? []).find(definition => definition.id === entry.class_definition_id) ?? null;
  }
  if (entry?.class_definition_kind === "custom" && entry.class_definition_id) {
    return (allCustomClasses.value ?? []).find(definition => definition.id === entry.class_definition_id) ?? null;
  }
  const className = entry?.class_name ?? fallbackName;
  return (allSystemClasses.value ?? []).find(definition => definition.class_name === className)
    ?? (allCustomClasses.value ?? []).find(definition => definition.class_name === className && !definition.source_document_key)
    ?? null;
}
const classData = computed(() => definitionFor(memberClassEntry.value, memberClass.value));
const memberPolicy = computed(() => memberClassEntry.value?.class_definition_kind === "custom"
  ? null
  : getSpellPreparationPolicy(memberClass.value, ruleset.value));
const casterType  = computed(() => memberPolicy.value?.casterType ?? classData.value?.caster_type ?? getCasterType(memberClass.value));
const maxPrepared = computed(() => {
  const policy = memberPolicy.value;
  if (policy) return policyValueAtLevel(policy.prepared, memberClassEntry.value?.levels ?? member.value?.level ?? 1);
  return computeMaxPrepared(member.value, classData.value, memberClass.value);
});
const memberName  = computed(() => member.value?.name ?? "");

/** Only classes this character actually has may be browsed as class spells. */
const availableSpellClasses = computed(() => {
  const names = (characterClasses.value ?? []).map((entry) => entry.class_name);
  if (names.length > 0) return [...new Set(names)].sort();
  return memberClass.value ? [memberClass.value] : [];
});

const browseSourceClassId = computed(() =>
  (characterClasses.value ?? []).find(
    (entry) => entry.class_name === ui.playerSpellsClassFilter,
  )?.id ?? null,
);
const browseClassName = computed(() => ui.playerSpellsClassFilter);
const browseClassEntry = computed(() => (characterClasses.value ?? []).find(
  entry => entry.id === browseSourceClassId.value,
));
const browseClassData = computed(() => definitionFor(browseClassEntry.value, browseClassName.value));
const browsePolicy = computed(() => browseClassEntry.value?.class_definition_kind === "custom"
  ? null
  : getSpellPreparationPolicy(browseClassName.value, ruleset.value));
const browseCasterType = computed(() =>
  browsePolicy.value?.casterType ?? browseClassData.value?.caster_type ?? getCasterType(browseClassName.value),
);

// Total character level — sum of all class levels (multiclass), falls back to member.level
const memberLevel = computed(() => {
  const classes = characterClasses.value;
  if (classes && classes.length > 0) return classes.reduce((s, c) => s + c.levels, 0);
  return member.value?.level ?? 1;
});

// Effective spell slots — multiclass-aware: combines class levels per PHB.
// Falls back to per-class progression for single-class characters and to the
// legacy default when no character_classes rows exist yet.
const effectiveSpellSlots = computed(() => {
  const m = member.value;
  // casterType 'none' means no spellcasting class at all — a stale legacy
  // class field with real persisted slots is handled by RestButtons, which
  // reads member.spell_slots directly rather than through this computed.
  if (!m || casterType.value === "none") return [];
  return deriveEffectiveSpellSlots(
    m,
    characterClasses.value ?? [],
    ruleset.value,
    (entry) => definitionFor(entry, entry.class_name),
  );
});

// Spell attack bonus and save DC
function abilityMod(score: number) { return Math.floor((score - 10) / 2); }

const spellAttackBonus = computed(() => {
  const m = member.value;
  if (!m || casterType.value === "none") return null;
  const cls = m.class ?? "";
  let mod: number;
  if (["Cleric", "Druid", "Ranger"].includes(cls))                                            mod = abilityMod(m.wis);
  else if (["Wizard", "Fighter (Eldritch Knight)", "Rogue (Arcane Trickster)"].includes(cls)) mod = abilityMod(m.int);
  else                                                                                         mod = abilityMod(m.cha);
  return m.proficiency_bonus + mod;
});

const spellSaveDc = computed(() => {
  const bonus = spellAttackBonus.value;
  return bonus !== null ? 8 + bonus : null;
});

// Per-class spell DC / attack for multiclass casters. PlayerMySpells picks
// the right row for each spell entry via source_class_id. Empty for single-
// class characters — the legacy spellAttackBonus / spellSaveDc props remain
// the source of truth in that case.
const spellcastingByClass = computed(() => {
  const m = member.value;
  const list = characterClasses.value ?? [];
  if (!m || list.length === 0) return [];
  return computeSpellcastingByClass(
    m,
    list,
    { system: allSystemClasses.value ?? [], custom: allCustomClasses.value ?? [] },
    ruleset.value,
  );
});

const sorcererLevel = computed(() =>
  (characterClasses.value ?? []).find((entry) =>
    entry.class_name === "Sorcerer" && entry.class_definition_kind !== "custom",
  )?.levels
    ?? ((characterClasses.value ?? []).length === 0 && member.value?.class === "Sorcerer"
      ? member.value.level
      : 0),
);

// Character spells — IDs used for button state in browse tab
const { data: characterSpells }        = useCharacterSpells(resolvedMemberId);
// Details (with spell level) used for accurate known/cantrip counts
const { data: characterSpellsDetails } = useCharacterSpellsWithDetails(resolvedMemberId);
const rulesetReviewSpells = computed(() => {
  const flaggedIds = new Set(
    (rulesetReviews.value ?? [])
      .filter((r) => r.flag_type === "spell")
      .map((r) => r.character_spell_id)
      .filter((id): id is string => !!id),
  );
  return (characterSpellsDetails.value ?? []).filter((entry) => flaggedIds.has(entry.id));
});
const acknowledgingSpellRulesetReview = ref(false);
async function acknowledgeSpellRulesetReview() {
  if (!rulesetReviewSpells.value.length || acknowledgingSpellRulesetReview.value || !resolvedMemberId.value) return;
  acknowledgingSpellRulesetReview.value = true;
  try {
    await acknowledgeRulesetReviews({ partyMemberId: resolvedMemberId.value, flagTypes: ["spell"] });
    await queryClient.invalidateQueries({ queryKey: ["characterSpellsDetails", resolvedMemberId.value] });
    await queryClient.invalidateQueries({ queryKey: ["characterSpells", resolvedMemberId.value] });
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't acknowledge the rule change."));
  } finally {
    acknowledgingSpellRulesetReview.value = false;
  }
}
const { mutate: assignSpellSource, isPending: isAssigningSource } = useAssignCharacterSpellSource();
const legacySpells = computed(() => (characterSpellsDetails.value ?? []).filter((entry) =>
  (!entry.source_type || entry.source_type === "class") && !entry.source_class_id,
));
function sourceChoicesFor(spell: Spell) {
  return (characterClasses.value ?? []).filter((entry) => spell.classes.includes(entry.class_name));
}
function assignLegacySource(id: string, sourceClassId: string) {
  if (!resolvedMemberId.value || !sourceClassId) return;
  assignSpellSource({ id, partyMemberId: resolvedMemberId.value, sourceClassId });
}

// Separate class spells (slot-based) from innate (racial/feat/item)
const classSpells  = computed(() => (characterSpells.value ?? []).filter(cs => !cs.source_type || cs.source_type === "class"));
const innateSpells = computed(() => (characterSpellsDetails.value ?? []).filter(cs => cs.source_type && cs.source_type !== "class"));

const preparedSpellIds = computed(() => classSpells.value.filter((cs) => cs.is_prepared).map((cs) => cs.spell_id));
const browseClassSpells = computed(() => classSpells.value.filter((spell) => {
  if (browseSourceClassId.value) return spell.source_class_id === browseSourceClassId.value;
  // Legacy class spells predate source_class_id; associate them with the
  // character's original class until the player explicitly re-sources them.
  return !spell.source_class_id && ui.playerSpellsClassFilter === memberClass.value;
}));
const browseKnownSpellIds = computed(() => browseClassSpells.value.map((spell) => spell.spell_id));
const browsePreparedSpellIds = computed(() =>
  browseClassSpells.value.filter((spell) => spell.is_prepared).map((spell) => spell.spell_id),
);
const browseClassSpellDetails = computed(() => (characterSpellsDetails.value ?? []).filter(spell => {
  if (spell.source_type && spell.source_type !== "class") return false;
  if (browseSourceClassId.value) return spell.source_class_id === browseSourceClassId.value;
  return !spell.source_class_id && ui.playerSpellsClassFilter === memberClass.value;
}));
const browseKnownCantripCount = computed(() => browseClassSpellDetails.value.filter(spell => spell.spell?.level === 0).length);
const browsePreparedSpellCount = computed(() => browseClassSpellDetails.value.filter(spell =>
  spell.spell?.level > 0 && spell.is_prepared && !spell.always_prepared).length);
// Cantrips and spells are separate pools — spells_known table never includes cantrips
const knownCount    = computed(() => (characterSpellsDetails.value ?? []).filter(cs => (!cs.source_type || cs.source_type === "class") && cs.spell?.level > 0).length);
const cantripCount  = computed(() => (characterSpellsDetails.value ?? []).filter(cs => (!cs.source_type || cs.source_type === "class") && cs.spell?.level === 0).length);
const preparedCount = computed(() => preparedSpellIds.value.length);
const innateCount   = computed(() => innateSpells.value.length);
const maxKnown      = computed(() => {
  const m = member.value;
  if (!m || casterType.value !== "known") return null;
  const table = classData.value?.spells_known;
  if (!table) return null;
  return table[Math.min(m.level, 20) - 1] ?? null;
});
const maxCantrips   = computed(() => {
  const m = member.value;
  if (!m) return null;
  if (memberPolicy.value) {
    return policyValueAtLevel(memberPolicy.value.cantrips, memberClassEntry.value?.levels ?? m.level);
  }
  const table = classData.value?.cantrips_known;
  if (!table) return null;
  return table[Math.min(m.level, 20) - 1] ?? null;
});

// ── Tabs ───────────────────────────────────────────────────────────────────────
type TabId = "prepared" | "spellbook" | "innate" | "browse";

const allSpellsLabel = computed(() =>
  memberClass.value && (casterType.value === "prepared" || casterType.value === "known")
    ? `All ${memberClass.value} Spells`
    : "All Spells",
);

// Innate tab — always present so players can add racial/feat spells at any time
const innateTab = computed(() => ({
  id: "innate" as TabId,
  label: "Innate",
  count: innateCount.value || null,
  max: null, cantrips: null, maxCantrips: null,
}));

const tabs = computed(() => {
  const type = casterType.value;
  const cls  = memberClass.value;

  if (type === "spellbook") return [
    { id: "prepared" as TabId,  label: "Prepared",  count: preparedCount.value, max: null, cantrips: null, maxCantrips: null },
    { id: "spellbook" as TabId, label: "Spellbook", count: knownCount.value,    max: null, cantrips: null, maxCantrips: null },
    innateTab.value,
    { id: "browse" as TabId,    label: "All Spells", count: null,               max: null, cantrips: null, maxCantrips: null },
  ];
  if (type === "prepared") return [
    { id: "prepared" as TabId, label: "Prepared",           count: preparedCount.value, max: null, cantrips: null, maxCantrips: null },
    innateTab.value,
    { id: "browse" as TabId,   label: allSpellsLabel.value, count: null,               max: null, cantrips: null, maxCantrips: null },
  ];
  if (type === "known") return [
    { id: "spellbook" as TabId, label: `Known ${cls ? cls : ""}`.trim(), count: knownCount.value, max: maxKnown.value, cantrips: cantripCount.value, maxCantrips: maxCantrips.value },
    innateTab.value,
    { id: "browse" as TabId,    label: allSpellsLabel.value,             count: null,              max: null,          cantrips: null,               maxCantrips: null },
  ];
  // none — innate + browse
  return [
    innateTab.value,
    { id: "browse" as TabId, label: "All Spells", count: null, max: null, cantrips: null, maxCantrips: null },
  ];
});

const defaultTab = computed((): TabId => tabs.value[0].id);
const route = useRoute();
const hasQueryTab = !!route.query.tab;
const activeTab = ref<TabId>(
  (route.query.tab as TabId | undefined) ?? defaultTab.value,
);

// activeTab is seeded above before useParty()/useClassByName() resolve, so on a cold
// load casterType is still "none" and defaultTab picks the wrong tab (e.g. Innate
// instead of Prepared). Once caster type settles, correct the tab — but only if the
// user hasn't already picked one themselves and the URL didn't request one explicitly.
const userSelectedTab = ref(false);

function selectTab(id: TabId) {
  userSelectedTab.value = true;
  activeTab.value = id;
}

watch(casterType, () => {
  if (!hasQueryTab && !userSelectedTab.value) activeTab.value = defaultTab.value;
});

// ── Filters (browse tab) ───────────────────────────────────────────────────────
// Filter state lives in useUiStore so it survives navigation within a session.
const search = refDebounced(computed(() => ui.playerSpellsSearch), 400);

// Seed the class filter to the player's own class on first load.
if (!ui.playerSpellsClassFilter) ui.playerSpellsClassFilter = memberClass.value;

// When the previewed character changes, reset everything
watch(resolvedMemberId, () => {
  ui.playerSpellsClassFilter = memberClass.value;
  userSelectedTab.value = false;
  activeTab.value = defaultTab.value;
});

// Once party data first loads, apply the character's class if not yet set
watch(partyMembers, () => {
  if (!ui.playerSpellsClassFilter) ui.playerSpellsClassFilter = memberClass.value;
}, { once: true });

// Do not retain a class filter from a previously viewed character.
watch(availableSpellClasses, (classes) => {
  if (!classes.includes(ui.playerSpellsClassFilter)) {
    ui.playerSpellsClassFilter = classes[0] ?? "";
  }
}, { immediate: true });

function setLevelFilter(value: string) {
  ui.playerSpellsLevelFilter = value;
}
</script>
