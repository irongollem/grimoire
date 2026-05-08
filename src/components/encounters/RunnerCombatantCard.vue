<template>
  <div
    class="mc-card"
    :class="{
      'is-active': store.started && combatant.instance_id === store.activeCombatant?.instance_id,
      'is-dead': combatant.type === 'monster' && combatant.hp === 0,
      'is-selected': combatant.instance_id === selectedId,
    }"
    :style="{ '--faction-color': factionColor() }"
    @click="toggleDetail"
  >
    <!-- Row 1: avatar + name + type badge -->
    <div class="mc-head">
      <div class="mc-avatar" @click.stop="toggleDetail">
        <div
          class="avatar-inner"
          :class="store.started && combatant.instance_id === store.activeCombatant?.instance_id ? 'avatar-active' : ''"
        >
          <FocalImage
            :src="wildshape?.beast_image_url ?? combatant.portrait_url ?? undefined"
            :placeholder="combatant.type === 'player' ? '/assets/placeholders/character.webp' : combatant.npc_id ? '/assets/placeholders/npc.webp' : '/assets/placeholders/monster.webp'"
            :alt="wildshape?.beast_name ?? combatant.name"
            :focal-point="wildshape?.beast_image_url ? null : (combatant.portrait_focal_point ?? null)"
            format="square"
          />
          <button
            v-if="combatant.type === 'monster'"
            type="button"
            class="reveal-btn"
            :class="revealBtnClass(combatant.reveal_state)"
            :title="revealBtnTitle(combatant.reveal_state)"
            @click.stop="handleCycleReveal"
          >
            <IconHide v-if="combatant.reveal_state === 'hidden'" class="h-2.5 w-2.5" />
            <IconReveal v-else-if="combatant.reveal_state === 'unseen'" class="h-2.5 w-2.5" />
            <IconReveal v-else class="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
      <div class="mc-identity">
        <span class="combatant-name">{{ combatant.name }}</span>
        <div class="mc-badges">
          <span class="type-badge" :class="combatant.type">{{ combatant.type === 'player' ? 'PC' : combatant.npc_id ? 'NPC' : 'Monster' }}</span>
          <span v-if="wildshape" class="wildshape-row-badge" title="Wildshaping">🐺 {{ wildshape.beast_name }}</span>
          <span v-if="combatant.hp === 0 && combatant.type === 'monster'" class="dead-badge">☠</span>
          <button
            v-if="combatant.surprised"
            type="button"
            class="surprised-badge surprised-toggle"
            title="Surprised — tap to remove"
            @click.stop="store.toggleSurprised(combatant.instance_id)"
          >✦ Surprised ×</button>
          <button
            v-else-if="!store.started || store.round === 1"
            type="button"
            class="surprised-set-btn"
            title="Mark as surprised"
            @click.stop="store.toggleSurprised(combatant.instance_id)"
          >✦?</button>
        </div>
      </div>
    </div>

    <!-- Row 2: stats (init input + HP / max + AC) -->
    <div class="mc-stats" @click.stop>
      <label class="mc-stat-init">
        <span class="mc-stat-label">INIT</span>
        <input
          type="number"
          :value="combatant.initiative ?? ''"
          placeholder="—"
          class="init-input"
          @change="(e) => store.setInitiative(combatant.instance_id, Number((e.target as HTMLInputElement).value))"
        />
      </label>
      <div class="mc-stat-hp">
        <span class="mc-stat-label">HP</span>
        <span class="mc-stat-value">{{ displayHp }}<span class="mc-stat-sep">/</span>{{ displayMaxHp }}</span>
        <span v-if="combatant.temp_hp" class="mc-stat-temp">+{{ combatant.temp_hp }} tmp</span>
      </div>
      <div class="mc-stat-ac">
        <span class="mc-stat-label">AC</span>
        <span class="mc-stat-value">{{ displayAc }}</span>
      </div>
    </div>

    <!-- Row 3: HP adjust controls -->
    <div class="mc-hp-controls" @click.stop>
      <button class="hp-btn hp-btn-lg" @click="handleAdjustHp(-1)">−</button>
      <input
        type="number"
        :value="displayHp"
        min="0"
        :max="displayMaxHp"
        class="hp-input hp-input-lg"
        @change="(e) => handleSetHp(Number((e.target as HTMLInputElement).value))"
      />
      <button class="hp-btn hp-btn-lg" @click="handleAdjustHp(1)">+</button>
      <span
        v-if="flashInfo"
        :key="flashInfo.id"
        class="damage-flash"
        :class="flashInfo.delta < 0 ? 'is-damage' : 'is-heal'"
        @animationend="clearFlash"
      >{{ flashInfo.delta > 0 ? '+' : '' }}{{ flashInfo.delta }}</span>
    </div>

    <!-- Row 4: quick Dmg/Heal/Temp (visible when card is selected) -->
    <div
      v-if="combatant.instance_id === selectedId"
      class="mc-quick"
      @click.stop
    >
      <input
        v-model.number="quickAmount"
        type="number"
        min="0"
        placeholder="amt"
        class="quick-input"
        @keydown.enter="quickDamage"
      />
      <button type="button" class="quick-btn quick-dmg" @click="quickDamage">Dmg</button>
      <button type="button" class="quick-btn quick-heal" @click="quickHeal">Heal</button>
      <button type="button" class="quick-btn quick-temp" @click="quickTemp">+Temp</button>
    </div>

    <!-- Row 5: conditions -->
    <div class="mc-conditions" @click.stop>
      <ExhaustionChip
        v-if="getExhaustionLevel(displayConditions) > 0"
        variant="amber"
        :level="getExhaustionLevel(displayConditions)"
        @update="(lvl) => onExhaustionChange(lvl)"
      />
      <span
        v-for="cond in nonExhaustion(displayConditions)"
        :key="cond"
        class="cond-badge"
        :title="`${cond} — tap to remove\n\n${getConditionDescription(cond)}`"
        @click="store.toggleCondition(combatant.instance_id, cond)"
      >{{ cond }} ×</span>
      <button
        v-if="store.started"
        type="button"
        class="reaction-chip"
        :class="combatant.reactionUsed ? 'reaction-used' : 'reaction-ready'"
        :title="combatant.reactionUsed ? 'Reaction used — tap to restore' : 'Reaction available — tap to mark used'"
        @click="store.toggleReaction(combatant.instance_id)"
      >⚡</button>
      <ConditionPicker
        :conditions="displayConditions"
        @pick="onConditionPickerPick"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconHide, IconReveal } from '@/lib/icons';
import FocalImage from "@/components/common/FocalImage.vue";
import ExhaustionChip from "@/components/common/ExhaustionChip.vue";
import ConditionPicker from "@/components/encounters/ConditionPicker.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { getExhaustionLevel, getConditionDescription } from "@/lib/conditions";
import { useRunnerCombatant } from "@/composables/useRunnerCombatant";
import type { RunCombatant } from "@/types/encounter.types";

const { combatant, selectedId } = defineProps<{
  combatant: RunCombatant;
  selectedId: string | null;
}>();

const emit = defineEmits<{ select: [id: string | null] }>();

const store = useEncounterRunStore();

const {
  wildshape,
  displayHp,
  displayMaxHp,
  displayAc,
  displayConditions,
  factionColor,
  revealBtnClass,
  revealBtnTitle,
  nonExhaustion,
  flashInfo,
  clearFlash,
  handleAdjustHp,
  handleSetHp,
  quickAmount,
  quickDamage,
  quickHeal,
  quickTemp,
  onExhaustionChange,
  onConditionPickerPick,
  handleCycleReveal,
} = useRunnerCombatant(() => combatant);

function toggleDetail() {
  emit("select", selectedId === combatant.instance_id ? null : combatant.instance_id);
}
</script>

<style scoped>
@reference "@/assets/main.css";

/* ── Shared avatar styles ───────────────────────────────────────────────── */
.avatar-inner {
  position: relative;
  width: 2.5rem;
  height: 2.5rem;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-active {
  box-shadow: inset 0 0 0 2px #C9A84C;
}

.avatar-initials {
  @apply w-full h-full flex items-center justify-center font-cinzel text-[11px] font-bold;
}

.reveal-btn {
  @apply absolute bottom-0 right-0 flex items-center justify-center w-4 h-4 rounded-tl text-[10px] transition-colors;
}
.reveal-hidden   { @apply bg-muted/80 text-muted-foreground hover:bg-amber-500/80 hover:text-white; }
.reveal-unseen   { @apply bg-amber-500/80 text-white hover:bg-green-500/80; }
.reveal-revealed { @apply bg-green-500/80 text-white hover:bg-muted/80 hover:text-muted-foreground; }

/* ── Shared badge + chip styles ─────────────────────────────────────────── */
.combatant-name {
  @apply font-cinzel text-sm font-semibold text-foreground;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-badge {
  @apply font-cinzel text-[9px] font-bold px-1.5 py-0.5 rounded uppercase;
}
.type-badge.player  { @apply bg-primary/20 text-primary; }
.type-badge.monster { @apply bg-muted text-muted-foreground; }

.dead-badge { @apply text-destructive text-xs; }

.wildshape-row-badge {
  @apply font-fell text-[10px] text-amber-400 italic ml-1;
}

.surprised-badge {
  @apply font-cinzel text-[9px] text-amber-500 tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 ml-1;
}
.surprised-toggle { cursor: pointer; }
.surprised-toggle:hover { @apply bg-amber-500/20 border-amber-500/60; }

.surprised-set-btn {
  @apply font-cinzel text-[9px] text-muted-foreground/50 tracking-wider px-1 py-0.5 rounded border border-dashed border-muted-foreground/20 hover:text-amber-500 hover:border-amber-500/40 transition-colors;
}

.cond-badge {
  @apply inline-flex items-center px-1.5 py-0.5 rounded font-cinzel text-[9px] font-semibold bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 cursor-pointer hover:bg-destructive/20 hover:text-destructive transition-colors;
}

.reaction-chip {
  @apply inline-flex items-center px-1.5 py-0.5 rounded font-cinzel text-[9px] font-semibold border transition-colors cursor-pointer;
}
.reaction-ready { @apply bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20; }
.reaction-used  { @apply bg-muted text-muted-foreground/40 border-border line-through hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30; }

/* ── Shared HP styles ───────────────────────────────────────────────────── */
.init-input {
  @apply w-10 text-center bg-muted border border-border rounded px-1 py-0.5 font-cinzel text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}

.hp-btn {
  @apply w-6 h-6 rounded bg-muted border border-border font-cinzel font-bold text-sm flex items-center justify-center hover:bg-card transition-colors;
}

.hp-input {
  @apply w-12 text-center bg-muted border border-border rounded px-1 py-0.5 font-cinzel text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}

@keyframes damage-flash {
  0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
  70%  { opacity: 1; transform: translateX(-50%) translateY(-4px); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
}

.damage-flash {
  position: absolute;
  top: -0.1rem;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-cinzel);
  font-size: 0.9rem;
  font-weight: 800;
  pointer-events: none;
  animation: damage-flash 10s ease-in forwards;
  z-index: 10;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
}
.damage-flash.is-damage { @apply text-destructive; }
.damage-flash.is-heal   { @apply text-green-500; }

/* ── Quick HP panel ─────────────────────────────────────────────────────── */
.quick-input {
  width: 3.5rem;
  background: theme(colors.background);
  border: 1px solid theme(colors.border);
  border-radius: 0.25rem;
  padding: 0.2rem 0.4rem;
  font-family: var(--font-cinzel, serif);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  color: theme(colors.foreground);
  outline: none;
}
.quick-input:focus { border-color: theme(colors.ring); }
.quick-input::-webkit-inner-spin-button,
.quick-input::-webkit-outer-spin-button { -webkit-appearance: none; }

.quick-btn {
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  font-family: var(--font-cinzel, serif);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  border: 1px solid;
  transition: background-color 0.15s;
}
.quick-dmg  { border-color: theme(colors.rose.500 / 40%); color: theme(colors.rose.500); }
.quick-dmg:hover  { background: theme(colors.rose.500 / 15%); }
.quick-heal { border-color: theme(colors.green.500 / 40%); color: theme(colors.green.500); }
.quick-heal:hover { background: theme(colors.green.500 / 15%); }
.quick-temp { border-color: theme(colors.sky.400 / 40%); color: theme(colors.sky.400); }
.quick-temp:hover { background: theme(colors.sky.400 / 15%); }

/* ── Mobile card layout ─────────────────────────────────────────────────── */
.mc-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid theme(colors.border / 50%);
  position: relative;
  cursor: pointer;
  transition: background-color 0.15s;
}

.mc-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background-color: var(--faction-color);
}

.mc-card.is-active  { @apply bg-primary/10 ring-1 ring-primary/20 ring-inset; }
.mc-card.is-dead    { @apply opacity-40; }
.mc-card.is-selected { @apply bg-muted/40; }

.mc-head {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
}

.mc-avatar {
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
}

.mc-identity {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  flex: 1;
  min-width: 0;
}

.mc-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: center;
}

.mc-stats {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-left: 3.125rem;
  font-family: var(--font-cinzel, serif);
  font-size: 12px;
}

.mc-stat-init,
.mc-stat-hp,
.mc-stat-ac {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.mc-stat-label { @apply font-cinzel text-[10px] tracking-wider text-muted-foreground; }
.mc-stat-value { @apply font-cinzel text-sm font-bold text-foreground; }
.mc-stat-sep   { @apply text-muted-foreground font-normal mx-0.5; }
.mc-stat-temp  { @apply font-cinzel text-[10px] font-bold text-sky-400; }

.mc-hp-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-left: 3.125rem;
  position: relative;
}

.hp-btn-lg  { @apply w-8 h-8 text-base; }
.hp-input-lg { @apply w-16 h-8 text-base; }

.mc-quick {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding-left: 3.125rem;
  padding-top: 0.25rem;
  border-top: 1px solid theme(colors.border / 30%);
}

.mc-conditions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding-left: 3.125rem;
}
</style>
