<template>
  <div class="space-y-4 pb-8">
    <!-- Tab switcher -->
    <div class="flex rounded-md border border-border overflow-hidden w-fit text-xs font-cinzel font-semibold tracking-wider">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="px-4 py-1.5 transition-colors"
        :class="activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
        @click="selectTab(tab.id)"
      >
        {{ tab.label }}
        <span
          v-if="tab.count != null && tab.count > 0"
          class="ml-1.5 px-1.5 py-0.5 rounded-full text-2xs md:text-sm"
          :class="[
            activeTab === tab.id ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
            tab.max != null && tab.count > tab.max ? 'bg-destructive/20! text-destructive!' : ''
          ]"
        >{{ tab.count }}{{ tab.max != null ? ` / ${tab.max}` : '' }}{{ tab.cantrips != null ? ` + ${tab.cantrips}${tab.maxCantrips != null ? `/${tab.maxCantrips}` : ''}C` : '' }}</span>
      </button>
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
      view-mode="spellbook"
    />

    <!-- Innate tab -->
    <template v-else-if="activeTab === 'innate'">
      <div class="flex justify-end mb-2">
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-400 font-cinzel text-xs font-semibold tracking-wider hover:bg-violet-500/25 transition-colors"
          @click="addInnateOpen = true"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          Add Innate Spell
        </button>
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
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <!-- Level -->
        <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
          <button
            v-for="lvl in LEVEL_FILTERS"
            :key="lvl.value"
            class="px-2.5 py-1.5 transition-colors"
            :class="ui.playerSpellsLevelFilter === lvl.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="setLevelFilter(lvl.value)"
          >
            {{ lvl.label }}
          </button>
        </div>
        <!-- School -->
        <select
          v-model="ui.playerSpellsSchoolFilter"
          class="bg-card border border-border rounded-md px-3 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All Schools</option>
          <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
        </select>
        <!-- Class -->
        <select
          v-model="ui.playerSpellsClassFilter"
          class="bg-card border border-border rounded-md px-3 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option v-for="c in availableSpellClasses" :key="c" :value="c">{{ c }}</option>
        </select>
        <button
          v-if="ui.playerSpellsHasActiveFilters"
          type="button"
          class="px-3 py-1.5 font-cinzel text-xs tracking-wide text-muted-foreground hover:text-foreground border border-border rounded-md hover:border-foreground/30 transition-colors shrink-0"
          @click="ui.resetPlayerSpellsFilters()"
        >Clear</button>
      </div>

      <SpellList
        :search="search"
        :level-filter="ui.playerSpellsLevelFilter"
        :school-filter="ui.playerSpellsSchoolFilter"
        :class-filter="ui.playerSpellsClassFilter"
        :source-filter="'all'"
        :player-member-id="resolvedMemberId ?? undefined"
        :caster-type="browseCasterType"
        :known-spell-ids="knownSpellIds"
        :prepared-spell-ids="preparedSpellIds"
        :source-class-id="browseSourceClassId"
        @spell-click="selectedSpell = $event"
      />
    </template>
  </div>

  <PlayerSpellModal :spell="selectedSpell" @close="selectedSpell = null" />
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import { refDebounced } from "@vueuse/core";
import { IconGenerate, IconSearch } from '@/lib/icons';
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/useParty";
import { useCharacterSpells, useCharacterSpellsWithDetails } from "@/composables/useCharacterSpells";
import SpellList from "@/components/spells/SpellList.vue";
import PlayerMySpells from "@/components/spells/PlayerMySpells.vue";
import PlayerInnateSpells from "@/components/spells/PlayerInnateSpells.vue";
import AddInnateSpellDialog from "@/components/spells/AddInnateSpellDialog.vue";
import PlayerSpellModal from "@/components/spells/PlayerSpellModal.vue";
import type { Spell } from "@/types/spell.types";
import { SPELL_SCHOOLS, getCasterType, computeMaxPrepared, getDefaultSpellSlots, getMulticlassSpellSlots, getCasterCategory } from "@/types/spell.types";
import { useCharacterClasses } from "@/composables/useCharacterClasses";
import { useClassByName } from "@/composables/useCustomClasses";
import { computeSpellcastingPerClass } from "@/types/multiclass.types";
import { useRuleset } from "@/composables/useRuleset";
import { reconcileSpellSlotUsage } from "@/lib/spellSlots";

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

const classData   = useClassByName(memberClass);
const member      = computed(() => partyMembers.value?.find((m) => m.id === resolvedMemberId.value) ?? null);
const casterType  = computed(() => classData.value?.caster_type ?? getCasterType(memberClass.value));
const maxPrepared = computed(() => computeMaxPrepared(member.value, classData.value, memberClass.value));
const memberName  = computed(() => member.value?.name ?? "");

const { data: characterClasses } = useCharacterClasses(resolvedMemberId);

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
const browseCasterType = computed(() => getCasterType(ui.playerSpellsClassFilter));

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
  if (!m || casterType.value === "none") return [];
  const list = (characterClasses.value ?? []).map((c) => ({ class_name: c.class_name, levels: c.levels }));
  const canDeriveMulticlass = list.length > 1
    && list.every((entry) => getCasterCategory(entry.class_name) !== "none");
  if (canDeriveMulticlass) {
    return reconcileSpellSlotUsage(
      getMulticlassSpellSlots(list, ruleset.value),
      m.spell_slots ?? [],
    );
  }
  if (m.spell_slots?.length) return m.spell_slots;
  if (list.length > 0) return getMulticlassSpellSlots(list, ruleset.value);
  return getDefaultSpellSlots(m.class, m.level);
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
  if (!m) return [];
  const list = characterClasses.value ?? [];
  if (list.length === 0) return [];
  return computeSpellcastingPerClass(m, list);
});

// Character spells — IDs used for button state in browse tab
const { data: characterSpells }        = useCharacterSpells(resolvedMemberId);
// Details (with spell level) used for accurate known/cantrip counts
const { data: characterSpellsDetails } = useCharacterSpellsWithDetails(resolvedMemberId);

// Separate class spells (slot-based) from innate (racial/feat/item)
const classSpells  = computed(() => (characterSpells.value ?? []).filter(cs => !cs.source_type || cs.source_type === "class"));
const innateSpells = computed(() => (characterSpellsDetails.value ?? []).filter(cs => cs.source_type && cs.source_type !== "class"));

const knownSpellIds    = computed(() => classSpells.value.map((cs) => cs.spell_id));
const preparedSpellIds = computed(() => classSpells.value.filter((cs) => cs.is_prepared).map((cs) => cs.spell_id));
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
