<template>
  <div class="space-y-4 pb-8">
    <!-- No character linked -->
    <div v-if="!member" class="text-center py-16 space-y-4">
      <p class="text-heading text-muted-foreground">No character linked</p>
      <template v-if="ui.dmPreviewMode">
        <p class="text-body text-muted-foreground italic">Select a character above to preview their sheet.</p>
      </template>
      <template v-else>
        <p class="text-body text-muted-foreground italic">
          Build your own character sheet, or ask your DM to link you to an existing party member.
        </p>
        <AppButton to="/play/character/create" variant="primary" size="md" label="Create Character" />
      </template>
    </div>

    <template v-else>
      <!-- Status banner: shown only for a character seated at the active table; silent when the editions match. -->
      <CharacterEditionNotice
        v-if="campaign.activeCampaign && member.campaign_id === campaign.activeCampaign.id"
        :member="member"
        :campaign="campaign.activeCampaign"
      />
      <CharacterApprovalNotice v-if="member.campaign_id" :member="member" />
      <!-- ── Always visible ─────────────────────────────────── -->
      <!-- Outer wrapper: unified card on tablet+; stacked cards on mobile -->
      <div class="md:rounded-lg md:border md:border-border md:overflow-hidden">
        <div class="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0">
          <PlayerCharacterHeader
            :member="member"
            :wildshape="activeWildshape ?? undefined"
            :beast-speed="beastMonster?.stat_block?.speed"
            :hide-player-actions="hidePlayerActions"
            class="md:flex-1"
            @level-up="emit('level-up')"
          />
          <div class="md:w-72 md:shrink-0 md:border-l md:border-border md:bg-card md:flex md:flex-col">
            <!-- Ability scores: vertical single-table, flush against card edges -->
            <AbilityScoreTable
              :scores="effectiveScores"
              :saves="memberSaves"
              :rounded="false"
              :vertical="true"
              :borderless="true"
              :roll-mode-picker="true"
              @roll-ability="onRollAbility"
              @roll-save="onRollSave"
            />
            <!-- Conditions: separated by a divider, padded -->
            <div class="border-t border-border/40 px-3 py-2.5">
              <PlayerConditions :member="member" @roll="onChildRoll" />
            </div>
          </div>
        </div>
        <!-- Full-width HP bar — tablet+ only (mobile bar lives inside PlayerCharacterHeader) -->
        <div class="hidden md:block h-1.5 bg-muted overflow-hidden">
          <div class="h-full flex">
            <div class="h-full transition-all" :class="hpBarColor" :style="{ width: `${hpBarWidthPct}%` }" />
            <div v-if="tempHpBarPct > 0" class="h-full transition-all bg-tone-info" :style="{ width: `${tempHpBarPct}%` }" />
          </div>
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

      <!-- ── Tabs + Export Sheet ──────────────────────────── -->
      <div class="flex items-center gap-3 flex-wrap">
        <SegmentedControl
          v-model="activeTab"
          :options="tabOptions"
          variant="ghost"
          size="sm"
          class="rounded-md border border-border/50 bg-muted/40 p-1"
        />
        <div v-if="!hidePlayerActions && member" class="flex items-center gap-2 ml-auto">
          <AppButton v-if="!ui.dmPreviewMode" to="/play/champions" variant="subtle" size="sm" label="My Characters" />
          <AppButton :to="{ name: 'play-character-sheet' }" variant="subtle" size="sm" label="Export Sheet" />
        </div>
      </div>

      <!-- Skills -->
      <PlayerSkillsTab
        v-if="activeTab === 'skills'"
        :member="member"
        :override-scores="activeWildshape ? effectiveScores : undefined"
        :check-disadvantage="checkDisadvantage"
        :check-penalty="exhaustionD20Penalty"
        @roll="onChildRoll"
      />

      <!-- Features -->
      <PlayerFeaturesTab
        v-else-if="activeTab === 'features'"
        :member="member"
        :wildshape-monster="beastMonster ?? undefined"
        :is-owner="isOwner"
      />

      <!-- Combat -->
      <PlayerCombatTab
        v-else-if="activeTab === 'combat'"
        :member="member"
        :wildshape-monster="beastMonster ?? undefined"
        :attack-disadvantage="attackDisadvantage"
        :attack-penalty="exhaustionD20Penalty"
        :check-disadvantage="checkDisadvantage"
        :check-penalty="exhaustionD20Penalty"
        @roll="onChildRoll"
      />

      <!-- Lore -->
      <PlayerLoreTab
        v-else-if="activeTab === 'lore'"
        :member="member"
        :is-owner="isOwner"
      />

      <!-- Wild Shape -->
      <PlayerWildShapeTab
        v-else-if="activeTab === 'wildshape'"
        :member="member"
        :can-manage="canManage"
      />
    </template>

    <RollToast :result="lastRoll" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { WildshapeState } from "@/types/encounter.types";
import { usePlayerVisibleMonsters } from "@/composables/monsters/useMonsters";
import { useWildshapeDruid } from "@/composables/play/useWildshapeDruid";
import type { RollMode } from "@/lib/dice/roller";
import { combineModes } from "@/lib/dice/roller";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useParty } from "@/composables/party/useParty";
import { provideCharacterRuleset, useTableRuleset } from "@/composables/rules/useRuleset";
import {
  hasAttackDisadvantage,
  hasCheckDisadvantage,
  hasSaveDisadvantage,
  getExhaustionD20Penalty,
} from "@/rules/conditions";
import type { PartyMember } from "@/types/party.types";
import { useRules, usePlayerVisibleRules } from "@/composables/rules/useRules";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import RollToast from "@/components/common/RollToast.vue";
import type { RollResult } from "@/components/common/RollToast.vue";
import CharacterEditionNotice from "@/components/play/CharacterEditionNotice.vue";
import CharacterApprovalNotice from "@/components/play/CharacterApprovalNotice.vue";
import PlayerCharacterHeader from "@/components/player/PlayerCharacterHeader.vue";
import PlayerConditions from "@/components/player/PlayerConditions.vue";
import PlayerTracksSection from "@/components/player/PlayerTracksSection.vue";
import PlayerSkillsTab from "@/components/player/PlayerSkillsTab.vue";
import PlayerCombatTab from "@/components/player/PlayerCombatTab.vue";
import PlayerFeaturesTab from "@/components/player/PlayerFeaturesTab.vue";
import PlayerAppearanceSection from "@/components/player/PlayerAppearanceSection.vue";
import PlayerLoreTab from "@/components/player/PlayerLoreTab.vue";
import PlayerWildShapeTab from "@/components/player/PlayerWildShapeTab.vue";
import { useSpecies } from "@/composables/rules/useSpecies";

const props = defineProps<{ memberId?: string; hidePlayerActions?: boolean }>();
const emit = defineEmits<{ (e: "level-up"): void }>();

const auth = useAuthStore();
const ui = useUiStore();
const campaign = useCampaignStore();

// The character is resolved first so its ruleset scope is provided before any
// composable below (or any child) reads an edition. See useRuleset.ts.
const { data: partyMembers } = useParty();
const resolvedMemberId = computed(() =>
  props.memberId ?? (ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId),
);
const member = computed<PartyMember | null>(() =>
  resolvedMemberId.value && partyMembers.value
    ? (partyMembers.value.find((m) => m.id === resolvedMemberId.value) ?? null)
    : null,
);
provideCharacterRuleset(() => member.value);

// DM preview gets all rules; players get only player-visible ones.
const { data: dmRules }     = useRules();
const { data: playerRules } = usePlayerVisibleRules();
const customTrackers = computed(() => {
  const rules = ui.dmPreviewMode ? (dmRules.value ?? []) : (playerRules.value ?? []);
  return rules
    .filter((r) => r.tracker !== null)
    .map((r) => ({ ruleId: r.id, def: r.tracker! }));
});
const { promptRoll } = usePromptedRoll();
// Only used for condition-effect helpers (table rules); build rules live in the tabs.
const { ruleset } = useTableRuleset();

// ── Wild Shape ─────────────────────────────────────────────────────────────────
// The tab itself lives in PlayerWildShapeTab; the sheet keeps what the other tabs
// and the header need: the active form, its monster, and who is a druid.
// Resolved against the player-visible list, not `useAllMonsters`: a player cannot
// read the `monsters` table at all (see PlayerWildShapeTab).
const { data: allMonsters } = usePlayerVisibleMonsters();

const activeWildshape = computed<WildshapeState | null>(() =>
  (member.value?.wildshape_state as WildshapeState | null) ?? null,
);

const { isDruid } = useWildshapeDruid(resolvedMemberId, () => member.value);

const beastMonster = computed(() => {
  if (!activeWildshape.value) return null;
  return allMonsters.value?.find((x) => x.id === activeWildshape.value!.monster_id) ?? null;
});

// Beast's ability scores override STR/DEX/CON; player keeps INT/WIS/CHA.
const effectiveScores = computed(() => {
  const m = member.value;
  if (!m) return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  if (!activeWildshape.value) return m;
  const sb = beastMonster.value?.stat_block;
  if (!sb) return m;
  return { ...m, str: sb.str, dex: sb.dex, con: sb.con };
});

const isOwner = computed(
  () => !ui.dmPreviewMode && !!auth.linkedPartyMemberId && auth.linkedPartyMemberId === member.value?.id,
);

// The owner edits their own character; the DM does from the preview and from the
// party page (the only place a memberId is passed in). Anyone else reads.
const canManage = computed(() => isOwner.value || ui.dmPreviewMode || !!props.memberId);

// ── Shapeshifter ───────────────────────────────────────────────────────────────
const trueSpeciesId = computed(() => member.value?.species_id ?? "");
const { data: trueSpecies } = useSpecies(trueSpeciesId);
const canShapeshift = computed(
  () => !!trueSpecies.value?.is_shapeshifter,
);

// ── Tabs ───────────────────────────────────────────────────────────────────────
const ALL_TABS = [
  { id: "skills",    label: "Skills"    },
  { id: "features",  label: "Features"  },
  { id: "combat",    label: "Combat"    },
  { id: "lore",      label: "Lore"      },
  { id: "wildshape", label: "Wild Shape" },
] as const;
type TabId = (typeof ALL_TABS)[number]["id"];
const activeTab = ref<TabId>("skills");

// Wild Shape tab is only visible for Druids (or if somehow wildshaped)
const visibleTabs = computed(() =>
  ALL_TABS.filter((t) => t.id !== "wildshape" || isDruid.value || !!activeWildshape.value),
);
const tabOptions = computed(() => visibleTabs.value.map((t) => ({ value: t.id, label: t.label })));

// ── Ability helpers ────────────────────────────────────────────────────────────
type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";
const ABILITY_KEYS: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }

function isSaveProficient(key: string) {
  return member.value?.saving_throw_proficiencies?.includes(key as AbilityKey) ?? false;
}
function saveBonus(key: string) {
  if (!member.value) return 0;
  const score = effectiveScores.value[key as keyof typeof effectiveScores.value] as number;
  return abilityMod(score) + (isSaveProficient(key) ? member.value.proficiency_bonus : 0);
}
const memberSaves = computed(() => {
  if (!member.value) return undefined;
  return Object.fromEntries(
    ABILITY_KEYS.map((k) => [k, { bonus: saveBonus(k), proficient: isSaveProficient(k) }]),
  );
});

// ── Conditions (needed as props for child components) ──────────────────────────
const attackDisadvantage = computed(() => hasAttackDisadvantage(member.value?.conditions ?? [], ruleset.value));
const checkDisadvantage = computed(() => hasCheckDisadvantage(member.value?.conditions ?? [], ruleset.value));
// 2024-only flat penalty (0 under 2014, which uses the disadvantage flags above instead).
const exhaustionD20Penalty = computed(() => getExhaustionD20Penalty(member.value?.conditions ?? [], ruleset.value));

// ── HP bar (full-width, spans header + sidebar on tablet+) ────────────────────
const hpPct = computed(() => {
  const m = member.value;
  if (!m) return 0;
  const hp = activeWildshape.value?.beast_hp ?? m.current_hp;
  const maxHp = activeWildshape.value?.beast_max_hp ?? m.max_hp;
  if (maxHp === 0) return 0;
  return Math.max(0, Math.min(100, (hp / maxHp) * 100));
});
const hpBarColor = computed(() => {
  const p = hpPct.value;
  if (p <= 0) return "bg-muted-foreground/40";
  if (p < 33) return "bg-destructive";
  if (p < 66) return "bg-tone-caution";
  return "bg-elven-green";
});
// Temp HP is a buffer in front of whichever HP pool is active — it survives
// Wild Shape and is spent before the beast's HP, so the segment is shown in
// beast form too (denominator uses the beast's max, matching the HP segment).
const tempHpBarPct = computed(() => {
  const m = member.value;
  if (!m) return 0;
  const maxHp = activeWildshape.value?.beast_max_hp ?? m.max_hp;
  const temp = m.temp_hp ?? 0;
  if (temp <= 0 || maxHp + temp === 0) return 0;
  return (temp / (maxHp + temp)) * 100;
});
const hpBarWidthPct = computed(() => {
  const m = member.value;
  if (!m) return 0;
  const hp = activeWildshape.value?.beast_hp ?? m.current_hp;
  const maxHp = activeWildshape.value?.beast_max_hp ?? m.max_hp;
  const total = maxHp + (m.temp_hp ?? 0);
  if (total === 0) return 0;
  return Math.max(0, Math.min(100, (hp / total) * 100));
});

// ── Roll toast (shared across all rolling children) ───────────────────────────
const lastRoll = ref<RollResult | null>(null);

function onChildRoll(result: RollResult) { lastRoll.value = { ...result }; }

async function doRoll(label: string, modifier: number, mode: RollMode = "normal") {
  const modeTag = mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
  const fullLabel = label + modeTag;
  const result = await promptRoll({ counts: { 20: 1 }, modifier, label: fullLabel, mode });
  if (!result) return;
  const kept = result.breakdown.find(d => !d.dropped)!;
  lastRoll.value = { label: fullLabel, dice: kept.val, modifier, total: result.total };
}

function onRollAbility(_key: string, label: string, mod: number, override: RollMode | null = null) {
  doRoll(
    `${label} Check`,
    mod + exhaustionD20Penalty.value,
    combineModes(override ?? "normal", checkDisadvantage.value ? "disadvantage" : "normal"),
  );
}
function onRollSave(key: string, label: string, bonus: number, override: RollMode | null = null) {
  const saveDisadvantage = hasSaveDisadvantage(member.value?.conditions ?? [], key, ruleset.value);
  doRoll(
    `${label} Save`,
    bonus + exhaustionD20Penalty.value,
    combineModes(override ?? "normal", saveDisadvantage ? "disadvantage" : "normal"),
  );
}

</script>

