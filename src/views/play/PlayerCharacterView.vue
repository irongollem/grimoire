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
      <div class="flex items-start justify-between gap-2">
        <PlayerCharacterHeader :member="member" class="flex-1 min-w-0" />
        <RouterLink
          v-if="!ui.dmPreviewMode"
          to="/play/character/edit"
          class="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors mt-1"
        >
          Edit
        </RouterLink>
      </div>

      <AbilityScoreTable
        :scores="member"
        :saves="memberSaves"
        @roll-ability="onRollAbility"
        @roll-save="onRollSave"
      />

      <PlayerConditions :member="member" @roll="onChildRoll" />

      <!-- ── Tabs ───────────────────────────────────────────── -->
      <div class="flex rounded-md border border-border overflow-hidden w-fit text-xs font-cinzel font-semibold tracking-wider">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          class="px-4 py-1.5 transition-colors"
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

      <!-- Combat -->
      <PlayerCombatTab
        v-else
        :member="member"
        :attack-disadvantage="attackDisadvantage"
        @roll="onChildRoll"
      />
    </template>

    <!-- Roll toast (shared across all child rolls + ability/save rolls) -->
    <Transition name="toast">
      <div
        v-if="rollToast"
        class="fixed bottom-6 right-6 z-50 rounded-lg border border-primary/40 bg-card shadow-lg px-4 py-3 min-w-56 max-w-72"
      >
        <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-0.5">{{ rollToast.label }}</p>
        <div class="flex items-baseline gap-2">
          <span class="font-cinzel text-3xl font-bold text-foreground">{{ rollToast.total }}</span>
          <span class="font-fell text-sm text-muted-foreground">
            d20 ({{ rollToast.dice }})
            <template v-if="rollToast.modifier !== 0">
              {{ rollToast.modifier >= 0 ? "+" : "" }}{{ rollToast.modifier }}
            </template>
          </span>
        </div>
        <div class="h-1 w-full rounded-full bg-muted mt-2 overflow-hidden">
          <div class="h-full bg-primary rounded-full animate-[shrink_3s_linear_forwards]" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import { rollDice } from "@/lib/dice";
import type { RollMode } from "@/lib/dice";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/useParty";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { getCasterType, getDefaultSpellSlots, getMaxPrepared } from "@/types/spell.types";
import type { SpellSlotEntry } from "@/types/party.types";
import type { PartyMember } from "@/types/party.types";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import PlayerCharacterHeader from "@/components/player/PlayerCharacterHeader.vue";
import PlayerConditions from "@/components/player/PlayerConditions.vue";
import PlayerSkillsTab from "@/components/player/PlayerSkillsTab.vue";
import PlayerCombatTab from "@/components/player/PlayerCombatTab.vue";
import PlayerMySpells from "@/components/spells/PlayerMySpells.vue";

const props = defineProps<{ memberId?: string }>();

const auth = useAuthStore();
const ui = useUiStore();
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

// ── Tabs ───────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "skills",  label: "Skills"  },
  { id: "spells",  label: "Spells"  },
  { id: "combat",  label: "Combat"  },
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
const ATTACK_DIS_CONDITIONS = new Set(["Blinded", "Frightened", "Poisoned", "Prone", "Restrained"]);
const CHECK_DIS_CONDITIONS  = new Set(["Frightened", "Poisoned", "Exhausted 1", "Exhausted 2", "Exhausted 3"]);
const attackDisadvantage = computed(() =>
  member.value?.conditions?.some(c => ATTACK_DIS_CONDITIONS.has(c)) ?? false,
);
const checkDisadvantage = computed(() =>
  member.value?.conditions?.some(c => CHECK_DIS_CONDITIONS.has(c)) ?? false,
);

// ── Spells ─────────────────────────────────────────────────────────────────────
const casterType = computed(() => getCasterType(member.value?.class ?? null));

const effectiveSpellSlots = computed<SpellSlotEntry[]>(() => {
  const m = member.value;
  if (!m || casterType.value === "none") return [];
  if (m.spell_slots?.length) return m.spell_slots;
  return getDefaultSpellSlots(m.class, m.level);
});

const maxPrepared = computed(() => getMaxPrepared(member.value, member.value?.class ?? ""));

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
interface RollToast { label: string; dice: number; modifier: number; total: number; }
const rollToast = ref<RollToast | null>(null);
let rollTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(result: RollToast) {
  rollToast.value = result;
  if (rollTimer) clearTimeout(rollTimer);
  rollTimer = setTimeout(() => { rollToast.value = null; }, 3000);
}

function onChildRoll(result: RollToast) { showToast(result); }

function doRoll(label: string, modifier: number, mode: RollMode = "normal") {
  const modeTag = mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
  const result = rollDice({ 20: 1 }, modifier, mode);
  const kept = result.breakdown.find(d => !d.dropped)!;
  const fullLabel = label + modeTag;
  showToast({ label: fullLabel, dice: kept.val, modifier, total: result.total });
  void sendRoll({ ...result, label: fullLabel });
}

function onRollAbility(_key: string, label: string, mod: number) {
  doRoll(`${label} Check`, mod, checkDisadvantage.value ? "disadvantage" : "normal");
}
function onRollSave(_key: string, label: string, bonus: number) {
  doRoll(`${label} Save`, bonus);
}

</script>

<style scoped>
.toast-enter-active { transition: all 0.2s ease-out; }
.toast-leave-active { transition: all 0.15s ease-in; }
.toast-enter-from   { opacity: 0; transform: translateY(8px) scale(0.95); }
.toast-leave-to     { opacity: 0; transform: translateY(4px) scale(0.97); }
</style>
