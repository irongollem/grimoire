<template>
  <!-- Wide screens: character (left) | encounter (right, sticky)
       Narrow screens: encounter (top) then character (bottom) -->
  <div class="flex flex-col xl:flex-row gap-6 items-start pb-8">
    <!-- Encounter panel — top on mobile, sticky right column on xl -->
    <div
      class="w-full xl:w-112.5 xl:shrink-0 xl:order-2 xl:sticky xl:top-6 space-y-4"
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
        <!-- Your Turn! banner -->
        <div
          v-if="isMyTurn"
          class="flex items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 px-4 py-3 animate-pulse"
        >
          <Swords class="h-4 w-4 text-primary shrink-0" />
          <span
            class="font-cinzel text-sm font-bold text-primary tracking-wider"
            >YOUR TURN!</span
          >
          <Swords class="h-4 w-4 text-primary shrink-0" />
        </div>

        <!-- Round + active turn header -->
        <div
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
                  : 'hover:bg-muted/20'
              "
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
        </div>
      </template>
    </div>

    <!-- Character sheet — below on mobile, left column on xl -->
    <div class="w-full xl:flex-1 xl:min-w-0 xl:order-1">
      <PlayerCharacterView />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Swords } from "lucide-vue-next";
import FocalImage from "@/components/common/FocalImage.vue";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { liveState } from "@/composables/useEncounterLive";
import type { RunCombatant, HealthVisibility } from "@/types/encounter.types";
import PlayerCharacterView from "@/views/play/PlayerCharacterView.vue";

const campaign = useCampaignStore();
const auth = useAuthStore();

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

const isMyTurn = computed(() => {
  if (!myPlayer.value || !liveState.value) return false;
  const active = sortedCombatants.value[liveState.value.active_combatant_index];
  return active?.instance_id === myPlayer.value.instance_id;
});

function isActive(combatant: RunCombatant): boolean {
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
</style>
