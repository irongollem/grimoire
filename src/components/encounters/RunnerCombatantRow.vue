<template>
  <div class="combatant-wrap">
    <div
      class="combatant-row"
      :class="{
        'is-active': store.started && combatant.instance_id === store.activeCombatant?.instance_id,
        'is-dead': combatant.type === 'monster' && combatant.hp === 0,
        'is-selected': combatant.instance_id === selectedId,
      }"
      :style="{ '--faction-color': factionColor() }"
      @click="toggleDetail"
    >
      <!-- Avatar + reveal toggle (monsters only) -->
      <div class="avatar-cell" @click.stop="toggleDetail">
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

      <!-- Initiative -->
      <div class="init-cell" @click.stop>
        <RunnerInitiativeField :combatant="combatant" />
      </div>

      <!-- Name + type badge -->
      <div class="name-cell">
        <span class="combatant-name">{{ combatant.name }}</span>
        <span class="type-badge" :class="combatant.type">{{ combatant.type === 'player' ? 'PC' : combatant.npc_id ? 'NPC' : 'Monster' }}</span>
        <span v-if="wildshape" class="wildshape-row-badge" title="Wildshaping">🐺 {{ wildshape.beast_name }}</span>
        <span v-if="combatant.hp === 0 && combatant.type === 'monster'" class="dead-badge">☠</span>
        <AppButton
          v-if="combatant.surprised"
          variant="tinted"
          tone="caution"
          size="xs"
          class="ml-1"
          label="✦ Surprised ×"
          tooltip="Surprised — click to remove"
          @click.stop="store.toggleSurprised(combatant.instance_id)"
        />
        <button
          v-else-if="!store.started || store.round === 1"
          type="button"
          class="surprised-set-btn"
          title="Mark as surprised"
          @click.stop="store.toggleSurprised(combatant.instance_id)"
        >✦?</button>
      </div>

      <!-- HP -->
      <div class="hp-cell" @click.stop>
        <button class="hp-btn" @click="handleAdjustHp(-1)">−</button>
        <AppInput
          :model-value="String(displayHp)"
          :model-modifiers="{ lazy: true }"
          type="number"
          tone="filled"
          size="xs"
          align="center"
          :block="false"
          class="w-12 font-bold"
          min="0"
          :max="displayMaxHp"
          @update:model-value="(v) => handleSetHp(Number(v))"
        />
        <span class="hp-max">/</span>
        <AppInput
          :model-value="String(displayMaxHp)"
          :model-modifiers="{ lazy: true }"
          type="number"
          tone="bare"
          size="xs"
          align="center"
          :block="false"
          class="w-11 text-muted-foreground font-normal"
          min="1"
          title="Max HP — edit to raise or lower on the fly"
          @update:model-value="(v) => handleSetMaxHp(Number(v))"
        />
        <button class="hp-btn" @click="handleAdjustHp(1)">+</button>
        <span
          v-if="flashInfo"
          :key="flashInfo.id"
          class="damage-flash"
          :class="flashInfo.delta < 0 ? 'is-damage' : 'is-heal'"
          @animationend="clearFlash"
        >{{ flashInfo.delta > 0 ? '+' : '' }}{{ flashInfo.delta }}</span>
      </div>

      <!-- AC -->
      <div class="ac-cell">
        <span class="ac-value">{{ displayAc }}</span>
      </div>

      <!-- Conditions -->
      <div class="conditions-cell" @click.stop>
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
          :title="`${cond} — click to remove\n\n${getConditionDescription(cond, ruleset)}`"
          @click="store.toggleCondition(combatant.instance_id, cond)"
        >{{ cond }} ×</span>
        <span
          v-if="pcConcentration"
          class="conc-chip"
          :title="`Concentrating on ${pcConcentration} — click to drop`"
          @click="dropCombatantConcentration"
        >✦ {{ pcConcentration }} ×</span>
        <button
          v-if="store.started"
          type="button"
          class="reaction-chip"
          :class="combatant.reactionUsed ? 'reaction-used' : 'reaction-ready'"
          :title="combatant.reactionUsed ? 'Reaction used — click to restore' : 'Reaction available — click to mark used'"
          @click="store.toggleReaction(combatant.instance_id)"
        >⚡</button>
        <ConditionPicker
          :conditions="displayConditions"
          @pick="onConditionPickerPick"
        />
      </div>
    </div>

    <!-- Quick HP panel — shown when row is selected -->
    <div
      v-if="combatant.instance_id === selectedId"
      class="hp-quick-panel"
      @click.stop
    >
      <AppInput
        v-model.number="quickAmount"
        type="number"
        min="0"
        size="xs"
        align="center"
        :block="false"
        class="w-14 font-bold"
        placeholder="amt"
        @keydown.enter="quickDamage"
      />
      <AppButton variant="tinted" tone="danger" emphasis="outline" size="xs" label="Dmg" @click="quickDamage" />
      <AppButton variant="tinted" tone="success" emphasis="outline" size="xs" label="Heal" @click="quickHeal" />
      <AppButton variant="tinted" tone="info" emphasis="outline" size="xs" label="+Temp" @click="quickTemp" />
      <span v-if="displayTempHp" class="quick-temp-display">{{ displayTempHp }} tmp</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconHide, IconReveal } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import ExhaustionChip from "@/components/common/ExhaustionChip.vue";
import ConditionPicker from "@/components/encounters/ConditionPicker.vue";
import RunnerInitiativeField from "@/components/encounters/RunnerInitiativeField.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useRuleset } from "@/composables/useRuleset";
import { getExhaustionLevel, getConditionDescription } from "@/rules/conditions";
import { useRunnerCombatant } from "@/composables/useRunnerCombatant";
import type { RunCombatant } from "@/types/encounter.types";

const { combatant, selectedId } = defineProps<{
  combatant: RunCombatant;
  selectedId: string | null;
}>();

const emit = defineEmits<{ select: [id: string | null] }>();

const store = useEncounterRunStore();
const { ruleset } = useRuleset();

const {
  wildshape,
  displayHp,
  displayMaxHp,
  displayTempHp,
  displayAc,
  displayConditions,
  pcConcentration,
  factionColor,
  revealBtnClass,
  revealBtnTitle,
  nonExhaustion,
  flashInfo,
  clearFlash,
  handleAdjustHp,
  handleSetHp,
  handleSetMaxHp,
  quickAmount,
  quickDamage,
  quickHeal,
  quickTemp,
  onExhaustionChange,
  onConditionPickerPick,
  dropCombatantConcentration,
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
  @apply w-full h-full flex items-center justify-center font-cinzel text-xs font-bold;
}

.reveal-btn {
  @apply absolute bottom-0 right-0 flex items-center justify-center w-4 h-4 rounded-tl text-2xs transition-colors;
}
.reveal-hidden  { @apply bg-muted/80 text-muted-foreground hover:bg-amber-500/80 hover:text-white; }
.reveal-unseen  { @apply bg-amber-500/80 text-white hover:bg-green-500/80; }
.reveal-revealed { @apply bg-green-500/80 text-white hover:bg-muted/80 hover:text-muted-foreground; }

/* ── Shared badge + chip styles ─────────────────────────────────────────── */
.combatant-name {
  @apply font-cinzel text-sm font-semibold text-foreground hover:text-primary transition-colors;
}

.type-badge {
  @apply font-cinzel text-2xs font-bold px-1.5 py-0.5 rounded uppercase;
}
.type-badge.player  { @apply bg-primary/20 text-primary; }
.type-badge.monster { @apply bg-muted text-muted-foreground; }

.dead-badge { @apply text-destructive text-xs; }

.wildshape-row-badge {
  @apply text-caption-sm text-amber-400 italic ml-1;
}

.surprised-set-btn {
  @apply text-label text-muted-foreground/50 px-1 py-0.5 rounded border border-dashed border-muted-foreground/20 hover:text-amber-500 hover:border-amber-500/40 transition-colors;
}

.cond-badge {
  @apply inline-flex items-center px-1.5 py-0.5 rounded font-cinzel text-2xs font-semibold bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 cursor-pointer hover:bg-destructive/20 hover:text-destructive transition-colors;
}

.conc-chip {
  @apply inline-flex items-center px-1.5 py-0.5 rounded font-cinzel text-2xs font-semibold bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 cursor-pointer hover:bg-destructive/20 hover:text-destructive transition-colors;
}

.reaction-chip {
  @apply inline-flex items-center px-1.5 py-0.5 rounded font-cinzel text-2xs font-semibold border transition-colors cursor-pointer;
}
.reaction-ready { @apply bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20; }
.reaction-used  { @apply bg-muted text-muted-foreground/40 border-border line-through hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30; }

/* ── Shared HP styles ───────────────────────────────────────────────────── */
.hp-btn {
  @apply w-6 h-6 rounded bg-muted border border-border font-cinzel font-bold text-sm flex items-center justify-center hover:bg-card transition-colors;
}

@keyframes damage-flash {
  0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
  70%  { opacity: 1; transform: translateX(-50%) translateY(-0.25rem); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-0.625rem); }
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

/* ── Quick HP panel styles ──────────────────────────────────────────────── */
.quick-temp-display {
  margin-left: auto;
  font-family: var(--font-cinzel, serif);
  font-size: 0.625rem;
  font-weight: 700;
  color: theme(colors.sky.400);
}

/* ── Desktop-only styles ────────────────────────────────────────────────── */
.combatant-wrap {
  border-bottom: 1px solid theme(colors.border / 50%);
}

.combatant-row {
  display: grid;
  grid-template-columns: 2.5rem 4.75rem 1fr 10rem 3rem 1fr;
  gap: 0.5rem;
  @apply pr-3 py-0 border-b border-border/50 items-stretch relative transition-colors hover:bg-muted/20 cursor-pointer;
}

.combatant-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0.1875rem;
  border-radius: 0 0.125rem 0.125rem 0;
  background-color: var(--faction-color);
}

.combatant-row.is-active  { @apply bg-primary/10 ring-1 ring-primary/20 ring-inset; }
.combatant-row.is-dead    { @apply opacity-40; }
.combatant-row.is-selected { @apply bg-muted/40; }

.combatant-wrap .combatant-row { border-bottom: none; }

.avatar-cell {
  align-self: center;
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  overflow: hidden;
  display: flex;
}

.init-cell,
.name-cell,
.hp-cell,
.ac-cell,
.conditions-cell {
  @apply self-center;
}

.init-cell { @apply flex items-center justify-center; }

.name-cell {
  @apply flex items-center gap-1.5 min-w-0 flex-wrap cursor-pointer select-none;
}

.hp-cell {
  @apply flex items-center justify-center gap-1 relative;
}

.hp-max { @apply font-cinzel text-xs text-muted-foreground; }

.ac-cell  { @apply flex items-center justify-center; }
.ac-value { @apply font-cinzel text-sm font-bold text-foreground text-center; }

.conditions-cell { @apply flex items-center flex-wrap gap-1; }

.hp-quick-panel {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem 0.375rem 3rem;
  background: theme(colors.muted / 15%);
  border-top: 1px solid theme(colors.border / 40%);
}
</style>
