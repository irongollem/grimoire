<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <template v-for="combatant in visibleCombatants" :key="combatant.instance_id">
      <!-- Unseen slot -->
      <div
        v-if="combatant.reveal_state === 'unseen' && combatant.type === 'monster'"
        class="player-row opacity-50"
        data-combatant-type="monster"
      >
        <div class="portrait-cell">
          <div class="portrait-inner">
            <div class="portrait-initials" style="background: rgba(100, 100, 100, 0.3); color: #888">?</div>
          </div>
        </div>
        <div class="row-content">
          <div class="shrink-0 w-8 text-center self-center">
            <span class="font-cinzel text-sm font-bold text-muted-foreground">{{ combatant.initiative ?? "—" }}</span>
          </div>
          <div class="flex-1 min-w-0 self-center">
            <div class="flex items-center gap-2 overflow-hidden">
              <span class="combatant-name font-cinzel text-sm font-semibold text-muted-foreground italic truncate">???</span>
              <span class="pc-npc-badge shrink-0 text-eyebrow md:text-sm px-1.5 py-0.5 rounded font-bold bg-muted text-muted-foreground">NPC</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Normal row -->
      <div
        v-else
        class="player-row cursor-pointer"
        :data-combatant-type="combatant.type"
        :class="isActive(combatant) ? 'bg-primary/8 ring-1 ring-inset ring-primary/20' : 'hover:bg-muted/20'"
        @click="$emit('combatant-click', combatant)"
      >
        <div class="portrait-cell">
          <div class="portrait-inner" :class="isActive(combatant) ? 'portrait-active' : ''">
            <FocalImage
              :src="portraitSrc(combatant) ?? undefined"
              :placeholder="combatant.type === 'player' ? '/assets/placeholders/character.webp' : combatant.npc_id ? '/assets/placeholders/npc.webp' : '/assets/placeholders/monster.webp'"
              :alt="portraitAlt(combatant)"
              :focal-point="portraitHasBeastImage(combatant) ? null : (combatant.portrait_focal_point ?? null)"
              format="square"
            />
          </div>
        </div>

        <div class="row-content">
          <div class="shrink-0 w-8 text-center self-center">
            <span
              class="font-cinzel text-sm font-bold"
              :class="isActive(combatant) ? 'text-primary' : 'text-muted-foreground'"
            >{{ combatant.initiative ?? "—" }}</span>
          </div>

          <div class="flex-1 min-w-0 self-center">
            <div class="flex items-center gap-2 overflow-hidden">
              <span class="combatant-name font-cinzel text-sm font-semibold text-foreground truncate min-w-0">{{ combatant.name }}</span>
              <span
                class="pc-npc-badge shrink-0 text-label md:text-sm px-1.5 py-0.5 rounded font-bold"
                :class="combatant.type === 'player' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'"
              >{{ combatant.type === "player" ? "PC" : "NPC" }}</span>
              <span
                v-for="cond in combatant.conditions"
                :key="cond"
                class="shrink-0 text-label md:text-sm px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500"
              >{{ cond }}</span>
            </div>
            <div
              v-if="healthVis === 'strategic' || (healthVis === 'immersive' && combatant.type === 'player')"
              class="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden"
            >
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="hpBarColor(combatant)"
                :style="{ width: `${Math.max(0, Math.min(100, (displayHp(combatant) / displayMaxHp(combatant)) * 100))}%` }"
              />
            </div>
          </div>

          <div class="shrink-0 text-right self-center pr-3">
            <template v-if="healthVis === 'strategic'">
              <template v-if="combatant.type === 'player'">
                <span class="font-cinzel text-sm font-bold" :class="hpColor(combatant)">{{ displayHp(combatant) }}</span>
                <span class="text-caption text-muted-foreground">/{{ displayMaxHp(combatant) }}</span>
                <span v-if="displayTempHp(combatant) > 0" class="text-caption text-blue-400 ml-1">+{{ displayTempHp(combatant) }}</span>
              </template>
              <template v-else>
                <span class="text-caption text-muted-foreground italic">{{ hpLabel(combatant) }}</span>
              </template>
            </template>
            <template v-else-if="healthVis === 'immersive' && combatant.type !== 'player'">
              <span class="text-caption text-muted-foreground italic">{{ hpLabel(combatant) }}</span>
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/FocalImage.vue";
import type { RunCombatant, HealthVisibility } from "@/types/encounter.types";
import type { PartyMember } from "@/types/party.types";
import { displayTempHp as calcDisplayTempHp } from "@/rules/hitPoints";

const {
  visibleCombatants,
  activeInstanceId,
  isInLobby,
  healthVis,
  partyMap,
} = defineProps<{
  visibleCombatants: RunCombatant[];
  /** instance_id of the currently active combatant, or null when in lobby */
  activeInstanceId: string | null;
  isInLobby: boolean;
  healthVis: HealthVisibility;
  partyMap: Map<string, PartyMember>;
}>();

defineEmits<{ "combatant-click": [combatant: RunCombatant] }>();

function isActive(combatant: RunCombatant): boolean {
  if (isInLobby || !activeInstanceId) return false;
  return combatant.instance_id === activeInstanceId;
}

// Portrait helpers
function portraitSrc(c: RunCombatant): string | null {
  if (c.type === "player") {
    const ws = partyMap.get(c.party_member_id ?? "")?.wildshape_state;
    return ws?.beast_image_url ?? c.portrait_url ?? null;
  }
  return c.wildshape?.beast_image_url ?? c.portrait_url ?? null;
}
function portraitAlt(c: RunCombatant): string {
  if (c.type === "player") {
    const ws = partyMap.get(c.party_member_id ?? "")?.wildshape_state;
    return ws?.beast_name ?? c.name;
  }
  return c.wildshape?.beast_name ?? c.name;
}
function portraitHasBeastImage(c: RunCombatant): boolean {
  if (c.type === "player") {
    return !!(partyMap.get(c.party_member_id ?? "")?.wildshape_state?.beast_image_url);
  }
  return !!c.wildshape?.beast_image_url;
}

// HP helpers
function displayHp(c: RunCombatant): number {
  if (c.type === "player") {
    const m = partyMap.get(c.party_member_id ?? "");
    if (m) return m.wildshape_state?.beast_hp ?? m.current_hp;
  }
  return c.wildshape?.beast_hp ?? c.hp;
}
function displayMaxHp(c: RunCombatant): number {
  if (c.type === "player") {
    const m = partyMap.get(c.party_member_id ?? "");
    if (m) return m.wildshape_state?.beast_max_hp ?? m.max_hp;
  }
  return c.wildshape?.beast_max_hp ?? c.max_hp;
}
// Temp HP applies in beast form too (it absorbs damage before the beast's HP),
// so it is not zeroed while wildshaped.
function displayTempHp(c: RunCombatant): number {
  return calcDisplayTempHp(c, partyMap);
}
function hpColor(c: RunCombatant) {
  const pct = displayHp(c) / displayMaxHp(c);
  if (pct <= 0) return "text-muted-foreground";
  if (pct <= 0.25) return "text-red-500";
  if (pct <= 0.5) return "text-amber-500";
  return "text-green-500";
}
function hpBarColor(c: RunCombatant) {
  const pct = displayHp(c) / displayMaxHp(c);
  if (pct <= 0) return "bg-muted-foreground/30";
  if (pct <= 0.25) return "bg-red-500";
  if (pct <= 0.5) return "bg-amber-500";
  return "bg-green-500";
}
function hpLabel(c: RunCombatant): string {
  const pct = displayHp(c) / displayMaxHp(c);
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
  font-size: 0.6875rem;
  font-weight: 700;
}

/* ── Compact mode: panel narrower than 200px ─────────────────────────────── */
@container (max-width: 200px) {
  .portrait-cell {
    display: none;
  }

  .player-row {
    min-height: 2rem;
  }

  .row-content {
    padding-top: 0.375rem;
    padding-bottom: 0.375rem;
    gap: 0.375rem;
  }

  .pc-npc-badge {
    display: none;
  }

  /* Color names by type instead of showing the badge */
  .player-row[data-combatant-type="player"] .combatant-name {
    color: #818cf8; /* indigo / primary */
  }
  .player-row[data-combatant-type="monster"] .combatant-name,
  .player-row[data-combatant-type="npc"] .combatant-name {
    color: #b45309; /* amber */
  }
}
</style>
