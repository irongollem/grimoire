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
        <div class="flex flex-wrap rounded-md border border-border overflow-hidden w-fit text-xs font-cinzel font-semibold tracking-wider">
          <button
            v-for="tab in visibleTabs"
            :key="tab.id"
            class="cursor-pointer px-4 py-1.5 transition-colors"
            :class="activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="activeTab = tab.id"
          >{{ tab.label }}</button>
        </div>
        <RouterLink
          v-if="!hidePlayerActions && member"
          :to="`/character-sheet/${member.id}`"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
        >
          Export Sheet
        </RouterLink>
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
            <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider">Uses</span>
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
              <p class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider">HP</p>
              <p class="font-cinzel text-sm font-bold">{{ activeWildshape.beast_hp }}/{{ activeWildshape.beast_max_hp }}</p>
            </div>
            <div class="text-center">
              <p class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider">AC</p>
              <p class="font-cinzel text-sm font-bold">{{ activeWildshape.beast_ac }}</p>
            </div>
            <div v-if="beastMonster?.stat_block?.speed" class="text-center">
              <p class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider">SPEED</p>
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
import type { Monster } from "@/types/monster.types";
import type { RollMode } from "@/lib/roller";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/useParty";
import { hasAttackDisadvantage, hasCheckDisadvantage } from "@/lib/conditions";
import { parseCr } from "@/lib/utils";
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

const isDruid = computed(() =>
  (member.value?.["class"] as string | null)?.toLowerCase().includes("druid") ?? false,
);
const isCircleOfMoon = computed(() =>
  member.value?.subclass?.toLowerCase().includes("moon") ?? false,
);

const wildshapeMaxCr = computed(() => {
  const level = member.value?.level ?? 1;
  if (isCircleOfMoon.value) return Math.max(1, Math.floor(level / 3));
  return Math.max(0.125, Math.floor(level / 2) * 0.5);
});
const wildshapeCrDisplay = computed(() => {
  const cr = wildshapeMaxCr.value;
  if (cr === 0.125) return "1/8";
  if (cr === 0.25)  return "1/4";
  if (cr === 0.5)   return "1/2";
  return String(cr);
});
// Max uses per day: 2 at level 2+, 0 before level 2
const wildshapeMaxUses = computed(() => {
  const level = member.value?.level ?? 1;
  return level >= 2 ? 2 : 0;
});
const wildshapesUsed = computed(() => member.value?.wildshapes_used ?? 0);
const canWildshape = computed(() => isDruid.value && (member.value?.level ?? 1) >= 2 && wildshapesUsed.value < wildshapeMaxUses.value);

const showWildshapePicker = ref(false);
const previewBeast = ref<Monster | null>(null);
const wildshapeForms = computed<Monster[]>(() => {
  if (!isDruid.value) return [];
  const level = member.value?.level ?? 1;
  const maxCr = wildshapeMaxCr.value;
  const discoveredKeys = new Set<string>(
    (discoveries.value ?? []).flatMap((d) => [d.monster_id, d.srd_slug].filter(Boolean) as string[]),
  );
  const pinnedKeys = new Set<string>(
    (pinnedForms.value ?? []).map((p) => p.monster_id ?? p.srd_slug ?? "").filter(Boolean),
  );
  return (allMonsters.value ?? [])
    .filter((m) => {
      if (!discoveredKeys.has(m.id) && !pinnedKeys.has(m.id)) return false;
      if ((m.monster_type ?? "").toLowerCase() !== "beast") return false;
      if (parseCr(m.stat_block?.challenge_rating) > maxCr) return false;
      if (level < 8) {
        const speed = (m.stat_block?.speed ?? "").toLowerCase();
        if (speed.includes("fly") || speed.includes("swim")) return false;
      }
      return true;
    })
    .sort((a, b) => parseCr(a.stat_block?.challenge_rating) - parseCr(b.stat_block?.challenge_rating));
});

async function handleWildshape(monster: Monster) {
  if (!member.value || !resolvedMemberId.value) return;
  const sb = monster.stat_block;
  const maxHp = parseInt(String(sb?.hit_points ?? "1").split(" ")[0], 10) || 1;
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
  const temp = m.temp_hp ?? 0;
  if (temp <= 0) return 0;
  const maxHp = activeWildshape.value?.beast_max_hp ?? m.max_hp;
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

function onRollAbility(_key: string, label: string, mod: number) {
  doRoll(`${label} Check`, mod, checkDisadvantage.value ? "disadvantage" : "normal");
}
function onRollSave(_key: string, label: string, bonus: number) {
  doRoll(`${label} Save`, bonus);
}

</script>

