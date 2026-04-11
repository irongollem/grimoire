<template>
  <!-- Wide screens: character (left) | encounter (right, sticky)
       Narrow screens: encounter (top) then character (bottom) -->
  <div class="flex flex-col lg:flex-row gap-6 items-start pb-8" :class="{ shake: isShaking }">
    <!-- Encounter panel — top on mobile, sticky right column on lg+ -->
    <div
      class="w-full lg:w-80 xl:w-112.5 lg:shrink-0 lg:order-2 lg:sticky lg:top-6 space-y-4"
    >
      <h2 class="font-cinzel text-xl font-bold text-foreground">
        Live Encounter
      </h2>

      <div v-if="!liveState" class="text-center py-16 space-y-3">
        <Swords class="h-10 w-10 text-muted-foreground/30 mx-auto" />
        <p class="font-cinzel text-sm text-muted-foreground">
          No encounter in progress.
        </p>
        <p class="font-fell text-xs text-muted-foreground italic">
          Your DM will start a live encounter when combat begins.
        </p>
      </div>

      <template v-else>
        <!-- Your Turn! banner — only in active combat -->
        <div
          v-if="isMyTurn && !isInLobby"
          class="flex items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 px-4 py-3 animate-pulse"
        >
          <Swords class="h-4 w-4 text-primary shrink-0" />
          <span
            class="font-cinzel text-sm font-bold text-primary tracking-wider"
            >YOUR TURN!</span
          >
          <Swords class="h-4 w-4 text-primary shrink-0" />
        </div>

        <!-- Lobby header -->
        <div
          v-if="isInLobby"
          class="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
        >
          <Swords class="h-4 w-4 text-amber-500/60 shrink-0" />
          <span class="font-cinzel text-sm font-semibold text-amber-500/80 tracking-wider">Gathering Party…</span>
          <span class="font-fell text-xs text-muted-foreground italic ml-auto">DM is preparing</span>
        </div>

        <!-- Round + active turn header — only in active combat -->
        <div
          v-else
          class="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3"
        >
          <div
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
          >
            ROUND
          </div>
          <div class="font-cinzel text-2xl font-bold text-primary">
            {{ liveState.current_round }}
          </div>
          <div v-if="activeCombatant" class="ml-4 flex items-center gap-2">
            <span
              class="font-cinzel text-xs text-muted-foreground tracking-wider"
              >ACTIVE:</span
            >
            <span class="font-cinzel text-sm font-bold text-foreground">
              {{
                activeCombatant.type === "monster" &&
                (activeCombatant.reveal_state ?? "hidden") === "hidden"
                  ? "???"
                  : activeCombatant.name
              }}
            </span>
          </div>
        </div>

        <!-- Wild Shape -->
        <template v-if="isDruid || myPlayer?.wildshape">
          <div class="rounded-lg border border-border bg-card overflow-hidden">
            <!-- Active form banner -->
            <template v-if="myPlayer?.wildshape">
              <div class="flex items-center justify-between px-3 py-2 bg-primary/10 border-b border-border">
                <span class="font-cinzel text-sm font-bold text-primary">🐺 {{ myPlayer.wildshape.beast_name }}</span>
                <button
                  type="button"
                  class="font-cinzel text-[10px] px-2 py-1 rounded border border-border hover:border-destructive hover:text-destructive transition-colors"
                  @click="doRevertWildshape"
                >Revert Form</button>
              </div>
              <template v-if="wildshapeMonster">
                <div class="flex gap-4 px-3 py-2">
                  <div class="text-center">
                    <p class="font-cinzel text-[9px] text-muted-foreground tracking-wider">AC</p>
                    <p class="font-cinzel text-sm font-bold">{{ wildshapeMonster.stat_block?.armor_class }}</p>
                  </div>
                  <div class="text-center">
                    <p class="font-cinzel text-[9px] text-muted-foreground tracking-wider">SPEED</p>
                    <p class="font-cinzel text-sm font-bold">{{ wildshapeMonster.stat_block?.speed }}</p>
                  </div>
                </div>
                <template v-for="section in wildshapeTraitSections" :key="section.label">
                  <template v-if="section.traits?.length">
                    <div class="border-t border-border px-3 py-2">
                      <p class="font-cinzel text-[9px] tracking-wider text-muted-foreground mb-1.5">{{ section.label.toUpperCase() }}</p>
                      <div v-for="t in section.traits" :key="t.name" class="mb-2 last:mb-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="font-cinzel text-[10px] font-semibold">{{ t.name }}.</span>
                          <button
                            v-if="parseWsAttackBonus(t.description) !== null"
                            type="button"
                            class="font-cinzel text-[9px] px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
                          >⚔ {{ (parseWsAttackBonus(t.description) ?? 0) >= 0 ? '+' : '' }}{{ parseWsAttackBonus(t.description) ?? 0 }}</button>
                        </div>
                        <p class="font-fell text-[11px] text-muted-foreground leading-relaxed mt-0.5">{{ t.description }}</p>
                      </div>
                    </div>
                  </template>
                </template>
              </template>
            </template>

            <!-- Picker (not currently wildshaped) -->
            <template v-else-if="isDruid">
              <div class="flex items-center justify-between px-3 py-2">
                <div class="flex items-center gap-2">
                  <span class="font-cinzel text-xs font-semibold">Wild Shape</span>
                  <span class="font-fell text-[10px] text-muted-foreground">Max CR {{ wildshapeCrDisplay }}</span>
                  <span v-if="isCircleOfMoon" class="font-cinzel text-[9px] tracking-wider px-1 py-0.5 rounded border border-primary/40 text-primary bg-primary/10">MOON</span>
                </div>
                <button
                  type="button"
                  class="font-cinzel text-[10px] px-2 py-1 rounded border border-border hover:border-primary hover:text-primary transition-colors"
                  @click="showWildshapePicker = !showWildshapePicker"
                >{{ showWildshapePicker ? 'Cancel' : '🐺 Choose Form' }}</button>
              </div>
              <template v-if="showWildshapePicker">
                <p v-if="!wildshapeForms.length" class="font-fell text-xs text-muted-foreground italic px-3 pb-2">
                  No eligible forms — discover beasts or ask your DM to pin forms.
                </p>
                <div v-else class="border-t border-border">
                  <button
                    v-for="m in wildshapeForms"
                    :key="m.id"
                    type="button"
                    class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/30 transition-colors border-b border-border/50 last:border-0"
                    @click="handleWildshape(m)"
                  >
                    <span class="font-cinzel text-xs font-semibold flex-1 min-w-0 truncate">{{ m.name }}</span>
                    <span class="font-fell text-[10px] text-muted-foreground shrink-0">CR {{ m.stat_block?.challenge_rating }}</span>
                    <span class="font-fell text-[10px] text-muted-foreground shrink-0">AC {{ m.stat_block?.armor_class }}</span>
                  </button>
                </div>
              </template>
            </template>
          </div>
        </template>

        <!-- Combatant list -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <template
            v-for="combatant in visibleCombatants"
            :key="combatant.instance_id"
          >
            <!-- Unseen slot -->
            <div
              v-if="
                combatant.reveal_state === 'unseen' &&
                combatant.type === 'monster'
              "
              class="player-row opacity-50"
            >
              <div class="portrait-cell">
                <div class="portrait-inner">
                  <div
                    class="portrait-initials"
                    style="background: rgba(100, 100, 100, 0.3); color: #888"
                  >
                    ?
                  </div>
                </div>
              </div>
              <div class="row-content">
                <div class="shrink-0 w-8 text-center self-center">
                  <span
                    class="font-cinzel text-sm font-bold text-muted-foreground"
                    >{{ combatant.initiative ?? "—" }}</span
                  >
                </div>
                <div class="flex-1 min-w-0 self-center">
                  <div class="flex items-center gap-2">
                    <span
                      class="font-cinzel text-sm font-semibold text-muted-foreground italic"
                      >???</span
                    >
                    <span
                      class="font-cinzel text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider bg-muted text-muted-foreground"
                      >NPC</span
                    >
                  </div>
                </div>
              </div>
            </div>

            <!-- Normal row -->
            <div
              v-else
              class="player-row"
              :class="
                isActive(combatant)
                  ? 'bg-primary/8 ring-1 ring-inset ring-primary/20'
                  : combatant.instance_id === myPlayer?.instance_id
                  ? 'hover:bg-muted/20 cursor-pointer'
                  : 'hover:bg-muted/20'
              "
              @click="combatant.instance_id === myPlayer?.instance_id && toggleHpPanel()"
            >
              <div class="portrait-cell">
                <div
                  class="portrait-inner"
                  :class="isActive(combatant) ? 'portrait-active' : ''"
                >
                  <FocalImage
                    v-if="combatant.portrait_url"
                    :src="combatant.portrait_url"
                    :alt="combatant.name"
                    :focal-point="combatant.portrait_focal_point ?? null"
                    format="square"
                  />
                  <div
                    v-else
                    class="portrait-initials"
                    :style="{
                      backgroundColor:
                        combatant.type === 'player'
                          ? 'rgba(99,102,241,0.2)'
                          : 'rgba(120,53,15,0.2)',
                      color:
                        combatant.type === 'player' ? '#818cf8' : '#b45309',
                    }"
                  >
                    {{
                      combatant.name
                        .split(" ")
                        .slice(0, 2)
                        .map((w: string) => w[0])
                        .join("")
                        .toUpperCase()
                    }}
                  </div>
                </div>
              </div>

              <div class="row-content">
                <div class="shrink-0 w-8 text-center self-center">
                  <span
                    class="font-cinzel text-sm font-bold"
                    :class="
                      isActive(combatant)
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    "
                  >
                    {{ combatant.initiative ?? "—" }}
                  </span>
                </div>

                <div class="flex-1 min-w-0 self-center">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span
                      class="font-cinzel text-sm font-semibold text-foreground truncate"
                      >{{ combatant.name }}</span
                    >
                    <span
                      class="font-cinzel text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider"
                      :class="
                        combatant.type === 'player'
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-muted-foreground'
                      "
                      >{{ combatant.type === "player" ? "PC" : "NPC" }}</span
                    >
                    <span
                      v-for="cond in combatant.conditions"
                      :key="cond"
                      class="font-cinzel text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 tracking-wider"
                      >{{ cond }}</span
                    >
                  </div>
                  <div
                    v-if="
                      healthVis === 'strategic' ||
                      (healthVis === 'immersive' && combatant.type === 'player')
                    "
                    class="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden"
                  >
                    <div
                      class="h-full rounded-full transition-all duration-300"
                      :class="hpBarColor(combatant)"
                      :style="{
                        width: `${Math.max(0, Math.min(100, (combatant.hp / combatant.max_hp) * 100))}%`,
                      }"
                    />
                  </div>
                </div>

                <div class="shrink-0 text-right self-center pr-3">
                  <template v-if="healthVis === 'strategic'">
                    <template v-if="combatant.type === 'player'">
                      <span
                        class="font-cinzel text-sm font-bold"
                        :class="hpColor(combatant)"
                        >{{ combatant.hp }}</span
                      >
                      <span class="font-fell text-xs text-muted-foreground"
                        >/{{ combatant.max_hp }}</span
                      >
                    </template>
                    <template v-else>
                      <span
                        class="font-fell text-xs text-muted-foreground italic"
                        >{{ hpLabel(combatant) }}</span
                      >
                    </template>
                  </template>
                  <template
                    v-else-if="
                      healthVis === 'immersive' && combatant.type !== 'player'
                    "
                  >
                    <span
                      class="font-fell text-xs text-muted-foreground italic"
                      >{{ hpLabel(combatant) }}</span
                    >
                  </template>
                </div>
              </div>
            </div>
          </template>

          <!-- HP adjustment panel — own row only -->
          <div
            v-if="showHpPanel && myPlayer"
            class="hp-panel"
            @click.stop
          >
            <input
              v-model.number="hpAmount"
              type="number"
              min="0"
              placeholder="0"
              class="hp-panel-input"
              @keydown.enter="applyDamage"
            />
            <button type="button" class="hp-panel-btn hp-dmg" @click="applyDamage">Dmg</button>
            <button type="button" class="hp-panel-btn hp-heal" @click="applyHeal">Heal</button>
            <button type="button" class="hp-panel-btn hp-temp" @click="applyTemp">+Temp</button>
            <span v-if="myPlayer.temp_hp" class="hp-temp-display">{{ myPlayer.temp_hp }} tmp</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Character sheet — below on mobile, left column on lg+ -->
    <div class="w-full lg:flex-1 lg:min-w-0 lg:order-1">
      <PlayerCharacterView />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Swords } from "lucide-vue-next";
import FocalImage from "@/components/common/FocalImage.vue";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { liveState } from "@/composables/useEncounterLive";
import type { RunCombatant, HealthVisibility } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import PlayerCharacterView from "@/views/play/PlayerCharacterView.vue";
import { usePlayerCombatPrefs } from "@/composables/usePlayerCombatPrefs";
import { useTurnChime } from "@/composables/useTurnChime";
import { useScreenShake } from "@/composables/useScreenShake";
import { useAllMonsters } from "@/composables/useMonsters";
import { useParty } from "@/composables/useParty";
import { usePlayerDiscoveries } from "@/composables/useDiscoveredMonsters";
import { usePinnedForms } from "@/composables/usePinnedForms";
import { useEncounterRunStore } from "@/stores/encounterRun";

const campaign = useCampaignStore();
const auth = useAuthStore();
const { turnAudioEnabled } = usePlayerCombatPrefs();
const { playTurnChime } = useTurnChime();
const { isShaking, triggerShake } = useScreenShake();

const healthVis = computed<HealthVisibility>(
  () =>
    (campaign.activeCampaign?.health_visibility as HealthVisibility) ??
    "strategic",
);

const sortedCombatants = computed(() => {
  if (!liveState.value) return [];
  return [...liveState.value.combatants_live].sort((a, b) => {
    const ia = a.initiative ?? -999;
    const ib = b.initiative ?? -999;
    if (ib !== ia) return ib - ia;
    if (a.type !== b.type) return a.type === "player" ? -1 : 1;
    return b.dex_mod - a.dex_mod;
  });
});

const visibleCombatants = computed(() =>
  sortedCombatants.value.filter(
    (c) => c.type === "player" || (c.reveal_state ?? "hidden") !== "hidden",
  ),
);

const activeCombatant = computed(
  () =>
    sortedCombatants.value[liveState.value?.active_combatant_index ?? 0] ??
    null,
);

const myMemberId = computed(() => auth.linkedPartyMemberId);

const myPlayer = computed(
  () =>
    sortedCombatants.value.find(
      (c) => c.party_member_id === myMemberId.value,
    ) ?? null,
);

const isInLobby = computed(() => (liveState.value?.current_round ?? 1) === 0);

const isMyTurn = computed(() => {
  if (!myPlayer.value || !liveState.value || isInLobby.value) return false;
  const active = sortedCombatants.value[liveState.value.active_combatant_index];
  return active?.instance_id === myPlayer.value.instance_id;
});

watch(isMyTurn, (now, prev) => {
  if (now && !prev) {
    triggerShake();
    if (turnAudioEnabled.value) playTurnChime();
  }
});

function isActive(combatant: RunCombatant): boolean {
  if (isInLobby.value) return false;
  const fullIdx = sortedCombatants.value.findIndex(
    (c) => c.instance_id === combatant.instance_id,
  );
  return fullIdx === liveState.value?.active_combatant_index;
}

function hpColor(c: RunCombatant) {
  const pct = c.hp / c.max_hp;
  if (pct <= 0) return "text-muted-foreground";
  if (pct <= 0.25) return "text-red-500";
  if (pct <= 0.5) return "text-amber-500";
  return "text-green-500";
}

function hpBarColor(c: RunCombatant) {
  const pct = c.hp / c.max_hp;
  if (pct <= 0) return "bg-muted-foreground/30";
  if (pct <= 0.25) return "bg-red-500";
  if (pct <= 0.5) return "bg-amber-500";
  return "bg-green-500";
}

function hpLabel(c: RunCombatant): string {
  const pct = c.hp / c.max_hp;
  if (pct <= 0) return "Dead";
  if (pct <= 0.25) return "Bloodied";
  if (pct <= 0.5) return "Wounded";
  if (pct <= 0.75) return "Hurt";
  return "Healthy";
}

// ── Wild Shape ────────────────────────────────────────────────────────────────

const runStore = useEncounterRunStore();
const { data: allMonsters } = useAllMonsters();
const { data: partyMembers } = useParty();
const { data: discoveries } = usePlayerDiscoveries();
const { data: pinnedForms } = usePinnedForms();

const myMember = computed(() =>
  partyMembers.value?.find((m) => m.id === myMemberId.value) ?? null,
);

const isDruid = computed(() =>
  (myMember.value?.["class"] as string | null)?.toLowerCase().includes("druid") ?? false,
);

const isCircleOfMoon = computed(() =>
  myMember.value?.subclass?.toLowerCase().includes("moon") ?? false,
);

function parseCr(cr: string | null | undefined): number {
  if (!cr || cr === "0") return 0;
  if (cr.includes("/")) {
    const [n, d] = cr.split("/");
    return Number(n) / Number(d);
  }
  return parseFloat(cr) || 0;
}

const wildshapeMaxCr = computed(() => {
  const level = myMember.value?.level ?? 1;
  if (isCircleOfMoon.value) return Math.max(1, Math.floor(level / 3));
  return Math.max(0.125, Math.floor(level / 2) * 0.5);
});

const wildshapeCrDisplay = computed(() => {
  const cr = wildshapeMaxCr.value;
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
});

const showWildshapePicker = ref(false);

const wildshapeForms = computed<Monster[]>(() => {
  if (!isDruid.value) return [];
  const level = myMember.value?.level ?? 1;
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

const wildshapeMonster = computed<Monster | null>(() => {
  const ws = myPlayer.value?.wildshape;
  if (!ws) return null;
  return allMonsters.value?.find((m) => m.id === ws.monster_id) ?? null;
});

const wildshapeTraitSections = computed(() => {
  const sb = wildshapeMonster.value?.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", traits: sb.special_abilities },
    { label: "Actions", traits: sb.actions },
    { label: "Bonus Actions", traits: sb.bonus_actions },
    { label: "Reactions", traits: sb.reactions },
  ].filter((s) => s.traits?.length);
});

function parseWsAttackBonus(desc: string): number | null {
  const m = desc.match(/\+(\d+)\s+to\s+hit/i);
  if (m) return parseInt(m[1], 10);
  const m2 = desc.match(/-(\d+)\s+to\s+hit/i);
  if (m2) return -parseInt(m2[1], 10);
  return null;
}

function handleWildshape(monster: Monster) {
  if (!myPlayer.value) return;
  const sb = monster.stat_block;
  const maxHp = parseInt(String(sb?.hit_points ?? "1").split(" ")[0], 10) || 1;
  const ac = String(sb?.armor_class ?? "10");
  runStore.enterWildshape(myPlayer.value.instance_id, {
    id: monster.id,
    name: monster.name,
    max_hp: maxHp,
    ac,
  });
  showWildshapePicker.value = false;
}

function doRevertWildshape() {
  if (!myPlayer.value) return;
  runStore.revertWildshape(myPlayer.value.instance_id);
}

// ── HP panel ──────────────────────────────────────────────────────────────────

const showHpPanel = ref(false);
const hpAmount = ref<number | null>(null);

function toggleHpPanel() {
  showHpPanel.value = !showHpPanel.value;
  hpAmount.value = null;
}

function applyDamage() {
  if (!myPlayer.value || !hpAmount.value) return;
  runStore.adjustHp(myPlayer.value.instance_id, -hpAmount.value);
  hpAmount.value = null;
}

function applyHeal() {
  if (!myPlayer.value || !hpAmount.value) return;
  runStore.adjustHp(myPlayer.value.instance_id, hpAmount.value);
  hpAmount.value = null;
}

function applyTemp() {
  if (!myPlayer.value || !hpAmount.value) return;
  runStore.setTempHp(myPlayer.value.instance_id, hpAmount.value);
  hpAmount.value = null;
}
</script>

<style scoped>
@reference "@/assets/main.css";

.player-row {
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
  border-bottom: 1px solid theme(colors.border / 100%);
  transition: background-color 0.15s;
  min-height: 3rem;
}
.player-row:last-child {
  border-bottom: none;
}

.row-content {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: stretch;
  gap: 0.75rem;
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}

.portrait-cell {
  flex-shrink: 0;
  width: 2.5rem;
  align-self: stretch;
  overflow: hidden;
  display: flex;
}

.portrait-inner {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.portrait-active {
  box-shadow: inset 0 0 0 2px #c9a84c;
}

.portrait-initials {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-cinzel, serif);
  font-size: 11px;
  font-weight: 700;
}

.hp-panel {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid theme(colors.border / 60%);
  background: theme(colors.muted / 20%);
}

.hp-panel-input {
  width: 4rem;
  background: theme(colors.background);
  border: 1px solid theme(colors.border);
  border-radius: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-family: var(--font-cinzel, serif);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  color: theme(colors.foreground);
  outline: none;
}
.hp-panel-input:focus {
  border-color: theme(colors.ring);
}
.hp-panel-input::-webkit-inner-spin-button,
.hp-panel-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
}

.hp-panel-btn {
  padding: 0.25rem 0.625rem;
  border-radius: 0.25rem;
  font-family: var(--font-cinzel, serif);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  border: 1px solid;
  transition: background-color 0.15s, color 0.15s;
}

.hp-dmg {
  border-color: theme(colors.rose.500 / 40%);
  color: theme(colors.rose.500);
}
.hp-dmg:hover {
  background: theme(colors.rose.500 / 15%);
}

.hp-heal {
  border-color: theme(colors.green.500 / 40%);
  color: theme(colors.green.500);
}
.hp-heal:hover {
  background: theme(colors.green.500 / 15%);
}

.hp-temp {
  border-color: theme(colors.sky.400 / 40%);
  color: theme(colors.sky.400);
}
.hp-temp:hover {
  background: theme(colors.sky.400 / 15%);
}

.hp-temp-display {
  margin-left: auto;
  font-family: var(--font-cinzel, serif);
  font-size: 10px;
  font-weight: 700;
  color: theme(colors.sky.400);
}
</style>
