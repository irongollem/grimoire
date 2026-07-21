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
          class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Create Character
        </RouterLink>
      </template>
    </div>

    <template v-else>
      <!-- ── Always visible ─────────────────────────────────── -->
      <!-- Outer wrapper: unified card on tablet+; stacked cards on mobile -->
      <div class="md:rounded-lg md:border md:border-border md:overflow-hidden">
        <div class="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0">
          <PlayerCharacterHeader
            :member="member"
            :wildshape="activeWildshape ?? undefined"
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
            <div v-if="tempHpBarPct > 0" class="h-full transition-all bg-blue-500" :style="{ width: `${tempHpBarPct}%` }" />
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
        <div class="flex flex-wrap rounded-md border border-border overflow-hidden w-fit text-label-lg font-semibold">
          <button
            v-for="tab in visibleTabs"
            :key="tab.id"
            class="cursor-pointer px-4 py-1.5 transition-colors"
            :class="activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="activeTab = tab.id"
          >{{ tab.label }}</button>
        </div>
        <div v-if="!hidePlayerActions && member" class="flex items-center gap-2 ml-auto">
          <RouterLink
            v-if="!ui.dmPreviewMode"
            to="/play/champions"
            class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
          >
            My Characters
          </RouterLink>
          <RouterLink
            :to="{ name: 'play-character-sheet' }"
            class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
          >
            Export Sheet
          </RouterLink>
        </div>
      </div>

      <!-- Skills -->
      <PlayerSkillsTab
        v-if="activeTab === 'skills'"
        :member="member"
        :override-scores="activeWildshape ? effectiveScores : undefined"
        :check-disadvantage="checkDisadvantage"
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
        @roll="onChildRoll"
      />

      <!-- Lore -->
      <PlayerLoreTab
        v-else-if="activeTab === 'lore'"
        :member="member"
        :is-owner="isOwner"
      />

      <!-- Wild Shape -->
      <div v-else-if="activeTab === 'wildshape'" class="space-y-4">
        <!-- Usage pips -->
        <div class="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-4">
          <div class="flex items-center gap-1.5">
            <span class="text-label md:text-sm text-muted-foreground">Uses</span>
            <div class="flex gap-1">
              <span
                v-for="i in wildshapeMaxUses"
                :key="i"
                class="h-3 w-3 rounded-full border-2 transition-colors"
                :class="i <= wildshapesUsed ? 'border-primary bg-primary/80' : 'border-muted-foreground/30'"
              />
            </div>
            <span class="font-cinzel text-2xs md:text-sm text-muted-foreground">{{ wildshapesUsed }}/{{ wildshapeMaxUses }}</span>
          </div>
          <span class="font-fell text-2xs md:text-sm text-muted-foreground italic">Max CR {{ wildshapeCrDisplay }}<template v-if="isCircleOfMoon"> · Moon</template></span>
        </div>

        <!-- Active form -->
        <div v-if="activeWildshape" class="rounded-lg border border-primary/40 bg-card overflow-hidden">
          <div class="flex items-center justify-between px-4 py-2.5 bg-primary/10 border-b border-border">
            <span class="font-cinzel text-sm font-bold text-primary">🐺 {{ activeWildshape.beast_name }}</span>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class="font-cinzel text-2xs md:text-sm px-2 py-1 rounded border border-border hover:border-primary hover:text-primary transition-colors"
                @click="showWildshapePicker = !showWildshapePicker"
              >{{ showWildshapePicker ? 'Cancel' : 'Change' }}</button>
              <button
                type="button"
                class="font-cinzel text-2xs md:text-sm px-2 py-1 rounded border border-border hover:border-destructive hover:text-destructive transition-colors"
                @click="doRevertWildshape(); showWildshapePicker = false"
              >Revert</button>
            </div>
          </div>
          <div class="flex gap-6 px-4 py-2.5">
            <div class="text-center">
              <p class="text-eyebrow md:text-sm text-muted-foreground">HP</p>
              <p class="font-cinzel text-sm font-bold">{{ activeWildshape.beast_hp }}/{{ activeWildshape.beast_max_hp }}</p>
            </div>
            <div class="text-center">
              <p class="text-label md:text-sm text-muted-foreground">AC</p>
              <p class="font-cinzel text-sm font-bold">{{ activeWildshape.beast_ac }}</p>
            </div>
            <div v-if="beastMonster?.stat_block?.speed" class="text-center">
              <p class="text-label md:text-sm text-muted-foreground">SPEED</p>
              <p class="font-cinzel text-sm font-bold">{{ beastMonster.stat_block.speed }}</p>
            </div>
          </div>
        </div>

        <!-- Picker / Choose Form -->
        <div v-if="!activeWildshape || showWildshapePicker" class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span class="font-cinzel text-xs font-semibold">Choose Beast Form</span>
            <button
              v-if="!activeWildshape"
              type="button"
              class="font-cinzel text-2xs md:text-sm px-2 py-1 rounded border border-border hover:border-primary hover:text-primary transition-colors"
              :disabled="!canWildshape"
              :class="!canWildshape ? 'opacity-40 cursor-not-allowed' : ''"
              @click="showWildshapePicker = !showWildshapePicker"
            >{{ showWildshapePicker ? 'Cancel' : '🐺 Choose Form' }}</button>
          </div>
          <template v-if="showWildshapePicker || !activeWildshape">
            <p v-if="!wildshapeForms.length" class="font-fell text-xs text-muted-foreground italic px-4 py-3">
              No eligible forms yet — discover beasts in the Bestiary or ask your DM to pin forms.
            </p>
            <div v-else class="divide-y divide-border">
              <button
                v-for="m in wildshapeForms"
                :key="m.id"
                type="button"
                class="w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/30"
                @click="previewBeast = m"
              >
                <span class="font-cinzel text-xs font-semibold flex-1 min-w-0 truncate">{{ m.name }}</span>
                <span class="font-fell text-2xs md:text-sm text-muted-foreground shrink-0">CR {{ m.stat_block?.challenge_rating }}</span>
                <span class="font-fell text-2xs md:text-sm text-muted-foreground shrink-0">AC {{ m.stat_block?.armor_class }}</span>
              </button>
            </div>
          </template>
        </div>
      </div>
    </template>

    <RollToast :result="lastRoll" />
  </div>

  <!-- Beast preview lightbox -->
  <WildshapePreviewLightbox
    :beast="previewBeast"
    :can-wildshape="canWildshape"
    :active-wildshape="!!activeWildshape"
    @close="previewBeast = null"
    @confirm="confirmWildshape"
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import WildshapePreviewLightbox from "@/components/play/WildshapePreviewLightbox.vue";
import type { WildshapeState } from "@/types/encounter.types";
import { useAllMonsters } from "@/composables/useMonsters";
import { useUpdatePartyMember } from "@/composables/useParty";
import { usePlayerDiscoveries } from "@/composables/useDiscoveredMonsters";
import { usePinnedForms } from "@/composables/usePinnedForms";
import { useCharacterClasses } from "@/composables/useCharacterClasses";
import type { Monster } from "@/types/monster.types";
import type { RollMode } from "@/lib/roller";
import { combineModes } from "@/lib/roller";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/useParty";
import { hasAttackDisadvantage, hasCheckDisadvantage, hasSaveDisadvantage } from "@/lib/conditions";
import { parseCr } from "@/lib/utils";
import { wildshapeMaxCr as calcWildshapeMaxCr, wildshapeCrDisplay as calcWildshapeCrDisplay, isEligibleWildshapeForm } from "@/lib/wildshape";
import { hitPointsToMax } from "@/lib/dice";
import type { PartyMember } from "@/types/party.types";
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
import PlayerAppearanceSection from "@/components/player/PlayerAppearanceSection.vue";
import PlayerLoreTab from "@/components/player/PlayerLoreTab.vue";
import { useSpecies } from "@/composables/useSpecies";

const props = defineProps<{ memberId?: string; hidePlayerActions?: boolean }>();
const emit = defineEmits<{ (e: "level-up"): void }>();

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
const { promptRoll } = usePromptedRoll();

const resolvedMemberId = computed(() =>
  props.memberId ?? (ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId),
);

// ── Wild Shape ─────────────────────────────────────────────────────────────────
const { mutateAsync: updateMember } = useUpdatePartyMember();
const { data: allMonsters } = useAllMonsters();
const { data: discoveries } = usePlayerDiscoveries();
const { data: pinnedForms } = usePinnedForms();

const activeWildshape = computed<WildshapeState | null>(() =>
  (member.value?.wildshape_state as WildshapeState | null) ?? null,
);

// Derive druid-ness, druid CLASS level, and subclass from the character_classes
// rows (the source of truth for multiclass), falling back to the legacy
// party_members.class/subclass/level fields — mirroring PlayerFeaturesTab's
// classLevel() pattern. Reading member.class/level directly broke multiclass:
// taking Druid as a second class never rewrites member.class (so the tab hid),
// and wildshapeMaxCr used TOTAL level (a Fighter 6/Druid 2 got CR 1½, not ¼).
const { data: characterClasses } = useCharacterClasses(resolvedMemberId);
const druidRow = computed(() =>
  (characterClasses.value ?? []).find(cc => cc.class_name.toLowerCase().includes("druid")) ?? null,
);
const isDruid = computed(() =>
  !!druidRow.value || ((member.value?.["class"] as string | null)?.toLowerCase().includes("druid") ?? false),
);
const druidLevel = computed(() =>
  druidRow.value?.levels
    ?? (((member.value?.["class"] as string | null)?.toLowerCase().includes("druid"))
      ? (member.value?.level ?? 1)
      : 0),
);
const isCircleOfMoon = computed(() =>
  (druidRow.value?.subclass_name ?? member.value?.subclass ?? "").toLowerCase().includes("moon"),
);

const wildshapeMaxCr = computed(() => calcWildshapeMaxCr(druidLevel.value, isCircleOfMoon.value));
const wildshapeCrDisplay = computed(() => calcWildshapeCrDisplay(wildshapeMaxCr.value));
// Max uses per day: 2 at druid level 2+, 0 before level 2
const wildshapeMaxUses = computed(() => (druidLevel.value >= 2 ? 2 : 0));
const wildshapesUsed = computed(() => member.value?.wildshapes_used ?? 0);
const canWildshape = computed(() => isDruid.value && druidLevel.value >= 2 && wildshapesUsed.value < wildshapeMaxUses.value);

const showWildshapePicker = ref(false);
const previewBeast = ref<Monster | null>(null);
const wildshapeForms = computed<Monster[]>(() => {
  if (!isDruid.value) return [];
  const level = druidLevel.value;
  const maxCr = wildshapeMaxCr.value;
  const discoveredKeys = new Set<string>(
    (discoveries.value ?? []).flatMap((d) => [d.monster_id, d.srd_slug].filter(Boolean) as string[]),
  );
  const pinnedKeys = new Set<string>(
    (pinnedForms.value ?? []).map((p) => p.monster_id ?? p.srd_slug ?? "").filter(Boolean),
  );
  return (allMonsters.value ?? [])
    .filter((m) =>
      (discoveredKeys.has(m.id) || pinnedKeys.has(m.id)) &&
      isEligibleWildshapeForm(m, level, maxCr),
    )
    .sort((a, b) => parseCr(a.stat_block?.challenge_rating) - parseCr(b.stat_block?.challenge_rating));
});

async function handleWildshape(monster: Monster) {
  if (!member.value || !resolvedMemberId.value) return;
  const sb = monster.stat_block;
  const maxHp = hitPointsToMax(sb?.hit_points, 1);
  const ac = String(sb?.armor_class ?? "10");
  const ws: WildshapeState = {
    monster_id: monster.id,
    beast_name: monster.name,
    beast_image_url: monster.image_url ?? null,
    beast_hp: maxHp,
    beast_max_hp: maxHp,
    beast_ac: ac,
  };
  await updateMember({ id: member.value.id, update: {
    wildshape_state: ws,
    wildshapes_used: wildshapesUsed.value + 1,
  }});
  showWildshapePicker.value = false;
}

async function confirmWildshape() {
  if (!previewBeast.value) return;
  await handleWildshape(previewBeast.value);
  previewBeast.value = null;
}

async function doRevertWildshape() {
  if (!member.value) return;
  await updateMember({ id: member.value.id, update: { wildshape_state: null } });
}

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

const member = computed<PartyMember | null>(() =>
  resolvedMemberId.value && partyMembers.value
    ? (partyMembers.value.find((m) => m.id === resolvedMemberId.value) ?? null)
    : null,
);

const isOwner = computed(
  () => !ui.dmPreviewMode && !!auth.linkedPartyMemberId && auth.linkedPartyMemberId === member.value?.id,
);

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
const attackDisadvantage = computed(() => hasAttackDisadvantage(member.value?.conditions ?? []));
const checkDisadvantage = computed(() => hasCheckDisadvantage(member.value?.conditions ?? []));

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
  if (p < 66) return "bg-amber-500";
  return "bg-elven-green";
});
const tempHpBarPct = computed(() => {
  const m = member.value;
  if (!m) return 0;
  // While wildshaped the bar tracks the beast's HP; the character's temp HP
  // doesn't apply to the beast form (the mobile header already zeroes it).
  if (activeWildshape.value) return 0;
  const temp = m.temp_hp ?? 0;
  if (temp <= 0) return 0;
  return (temp / (m.max_hp + temp)) * 100;
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
    mod,
    combineModes(override ?? "normal", checkDisadvantage.value ? "disadvantage" : "normal"),
  );
}
function onRollSave(key: string, label: string, bonus: number, override: RollMode | null = null) {
  const saveDisadvantage = hasSaveDisadvantage(member.value?.conditions ?? [], key);
  doRoll(
    `${label} Save`,
    bonus,
    combineModes(override ?? "normal", saveDisadvantage ? "disadvantage" : "normal"),
  );
}

</script>

