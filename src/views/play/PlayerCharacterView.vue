<template>
  <div class="space-y-4 pb-8">
    <!-- No character linked -->
    <div v-if="!member" class="text-center py-16 space-y-4">
      <p class="font-cinzel text-lg text-muted-foreground">No character linked</p>
      <template v-if="ui.dmPreviewMode">
        <p class="font-fell text-sm text-muted-foreground italic">Select a character above to preview their sheet.</p>
      </template>
      <template v-else>
        <p class="font-fell text-sm text-muted-foreground italic">
          Build your own character sheet, or ask your DM to link you to an existing party member.
        </p>
        <RouterLink
          to="/play/character/create"
          class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Create Character
        </RouterLink>
      </template>
    </div>

    <template v-else>
      <!-- ── Always visible ─────────────────────────────────── -->
      <div class="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0">
        <PlayerCharacterHeader
          :member="member"
          :hide-player-actions="hidePlayerActions"
          class="md:flex-1 md:rounded-r-none md:border-r-0"
        />
        <div class="md:w-72 md:shrink-0 md:border md:border-l-0 md:border-border md:bg-card md:rounded-r-lg md:overflow-hidden md:flex md:flex-col md:justify-center md:gap-3 md:px-3 md:py-3">
          <AbilityScoreTable
            :scores="member"
            :saves="memberSaves"
            :rounded="false"
            @roll-ability="onRollAbility"
            @roll-save="onRollSave"
          />
          <PlayerConditions :member="member" @roll="onChildRoll" />
        </div>
      </div>

      <!-- Tracks (custom + built-in rule trackers) -->
      <PlayerTracksSection
        v-if="resolvedMemberId"
        :member-id="resolvedMemberId"
        :custom-trackers="customTrackers"
      />

      <!-- Shapeshifter appearance controls (only visible to the player themselves) -->
      <PlayerAppearanceSection
        v-if="canShapeshift && member"
        :member="member"
      />

      <!-- ── Tabs ───────────────────────────────────────────── -->
      <div class="flex rounded-md border border-border overflow-hidden w-fit text-xs font-cinzel font-semibold tracking-wider">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          class="cursor-pointer px-4 py-1.5 transition-colors"
          :class="activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
          @click="activeTab = tab.id"
        >{{ tab.label }}</button>
      </div>

      <!-- Skills -->
      <PlayerSkillsTab
        v-if="activeTab === 'skills'"
        :member="member"
        :check-disadvantage="checkDisadvantage"
        @roll="onChildRoll"
      />

      <!-- Spells -->
      <PlayerMySpells
        v-else-if="activeTab === 'spells'"
        :party-member-id="resolvedMemberId"
        :caster-type="casterType"
        :member-class="member.class ?? ''"
        :member-name="member.name"
        :spell-slots="effectiveSpellSlots"
        :spell-attack-bonus="spellAttackBonus"
        :spell-save-dc="spellSaveDc"
        :max-prepared="maxPrepared"
        :view-mode="casterType === 'known' ? 'spellbook' : 'prepared'"
      />

      <!-- Features -->
      <PlayerFeaturesTab
        v-else-if="activeTab === 'features'"
        :member="member"
      />

      <!-- Combat -->
      <PlayerCombatTab
        v-else
        :member="member"
        :attack-disadvantage="attackDisadvantage"
        @roll="onChildRoll"
      />
    </template>

    <RollToast :result="lastRoll" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import { rollDice } from "@/lib/roller";
import type { RollMode } from "@/lib/roller";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/useParty";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { getCasterType, getDefaultSpellSlots, computeMaxPrepared } from "@/types/spell.types";
import { useClassByName } from "@/composables/useCustomClasses";
import { hasAttackDisadvantage, hasCheckDisadvantage } from "@/lib/conditions";
import type { SpellSlotEntry, PartyMember } from "@/types/party.types";
import { useRules, usePlayerVisibleRules } from "@/composables/useRules";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import RollToast from "@/components/common/RollToast.vue";
import type { RollResult } from "@/components/common/RollToast.vue";
import PlayerCharacterHeader from "@/components/player/PlayerCharacterHeader.vue";
import PlayerConditions from "@/components/player/PlayerConditions.vue";
import PlayerTracksSection from "@/components/player/PlayerTracksSection.vue";
import PlayerSkillsTab from "@/components/player/PlayerSkillsTab.vue";
import PlayerCombatTab from "@/components/player/PlayerCombatTab.vue";
import PlayerFeaturesTab from "@/components/player/PlayerFeaturesTab.vue";
import PlayerMySpells from "@/components/spells/PlayerMySpells.vue";
import PlayerAppearanceSection from "@/components/player/PlayerAppearanceSection.vue";
import { useSpecies } from "@/composables/useSpecies";

const props = defineProps<{ memberId?: string; hidePlayerActions?: boolean }>();

const auth = useAuthStore();
const ui = useUiStore();

// DM preview gets all rules; players get only player-visible ones.
const { data: dmRules }     = useRules();
const { data: playerRules } = usePlayerVisibleRules();
const customTrackers = computed(() => {
  const rules = ui.dmPreviewMode ? (dmRules.value ?? []) : (playerRules.value ?? []);
  return rules
    .filter((r) => r.tracker !== null)
    .map((r) => ({ ruleId: r.id, def: r.tracker! }));
});
const { data: partyMembers } = useParty();
const { sendRoll } = useCampaignMessages();

const resolvedMemberId = computed(() =>
  props.memberId ?? (ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId),
);

const member = computed<PartyMember | null>(() =>
  resolvedMemberId.value && partyMembers.value
    ? (partyMembers.value.find((m) => m.id === resolvedMemberId.value) ?? null)
    : null,
);

// ── Shapeshifter ───────────────────────────────────────────────────────────────
const trueSpeciesId = computed(() => member.value?.species_id ?? "");
const { data: trueSpecies } = useSpecies(trueSpeciesId);
const canShapeshift = computed(
  () => !ui.dmPreviewMode && !!trueSpecies.value?.is_shapeshifter,
);

// ── Tabs ───────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "skills",   label: "Skills"   },
  { id: "spells",   label: "Spells"   },
  { id: "features", label: "Features" },
  { id: "combat",   label: "Combat"   },
] as const;
type TabId = (typeof TABS)[number]["id"];
const activeTab = ref<TabId>("skills");

// ── Ability helpers ────────────────────────────────────────────────────────────
type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";
const ABILITY_KEYS: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }

function isSaveProficient(key: string) {
  return member.value?.saving_throw_proficiencies?.includes(key as AbilityKey) ?? false;
}
function saveBonus(key: string) {
  if (!member.value) return 0;
  const score = member.value[key as keyof PartyMember] as number;
  return abilityMod(score) + (isSaveProficient(key) ? member.value.proficiency_bonus : 0);
}
const memberSaves = computed(() => {
  if (!member.value) return undefined;
  return Object.fromEntries(
    ABILITY_KEYS.map((k) => [k, { bonus: saveBonus(k), proficient: isSaveProficient(k) }]),
  );
});

// ── Conditions (needed as props for child components) ──────────────────────────
const attackDisadvantage = computed(() => hasAttackDisadvantage(member.value?.conditions ?? []));
const checkDisadvantage = computed(() => hasCheckDisadvantage(member.value?.conditions ?? []));

// ── Spells ─────────────────────────────────────────────────────────────────────
const memberClassRef = computed(() => member.value?.class ?? "");
const classData = useClassByName(memberClassRef);
const casterType = computed(() => classData.value?.caster_type ?? getCasterType(member.value?.class ?? null));

const effectiveSpellSlots = computed<SpellSlotEntry[]>(() => {
  const m = member.value;
  if (!m || casterType.value === "none") return [];
  if (m.spell_slots?.length) return m.spell_slots;
  return getDefaultSpellSlots(m.class, m.level);
});

const maxPrepared = computed(() => computeMaxPrepared(member.value, classData.value, member.value?.class ?? ""));

const spellSaveDc = computed(() => {
  const m = member.value;
  if (!m || casterType.value === "none") return null;
  const cls = m.class ?? "";
  let spellMod: number;
  if (["Cleric", "Druid", "Ranger"].includes(cls))                                            spellMod = abilityMod(m.wis);
  else if (["Wizard", "Fighter (Eldritch Knight)", "Rogue (Arcane Trickster)"].includes(cls)) spellMod = abilityMod(m.int);
  else                                                                                         spellMod = abilityMod(m.cha);
  return 8 + m.proficiency_bonus + spellMod;
});

const spellAttackBonus = computed(() => {
  const dc = spellSaveDc.value;
  return dc !== null ? dc - 8 : null;
});

// ── Roll toast (shared across all rolling children) ───────────────────────────
const lastRoll = ref<RollResult | null>(null);

function onChildRoll(result: RollResult) { lastRoll.value = { ...result }; }

function doRoll(label: string, modifier: number, mode: RollMode = "normal") {
  const modeTag = mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
  const result = rollDice({ 20: 1 }, modifier, mode);
  const kept = result.breakdown.find(d => !d.dropped)!;
  const fullLabel = label + modeTag;
  lastRoll.value = { label: fullLabel, dice: kept.val, modifier, total: result.total };
  void sendRoll({ ...result, label: fullLabel });
}

function onRollAbility(_key: string, label: string, mod: number) {
  doRoll(`${label} Check`, mod, checkDisadvantage.value ? "disadvantage" : "normal");
}
function onRollSave(_key: string, label: string, bonus: number) {
  doRoll(`${label} Save`, bonus);
}

</script>

