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
            :src="portrait.src"
            :placeholder="portrait.shaped ? placeholderUrl('monster') : combatant.type === 'player' ? placeholderUrl('character') : combatant.npc_id ? placeholderUrl('npc') : placeholderUrl('monster')"
            :alt="portrait.alt"
            :focal-point="portrait.focalPoint"
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
          <RunnerRollStatus :combatant="combatant" />
          <span v-if="wildshape" class="wildshape-row-badge" title="Wildshaping">🐺 {{ wildshape.beast_name }}</span>
          <span v-if="combatant.hp === 0 && combatant.type === 'monster'" class="dead-badge">☠</span>
          <AppButton
            v-if="combatant.surprised"
            variant="tinted"
            tone="caution"
            size="xs"
            class="ml-1"
            label="✦ Surprised ×"
            tooltip="Surprised, tap to remove"
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
      </div>
    </div>

    <!-- Row 2: stats (init input + HP / max + AC) -->
    <div class="mc-stats" @click.stop>
      <div class="mc-stat-init">
        <span class="mc-stat-label">INIT</span>
        <RunnerInitiativeField :combatant="combatant" />
      </div>
      <div class="mc-stat-hp">
        <span class="mc-stat-label">HP</span>
        <span class="mc-stat-value">{{ displayHp }}<span class="mc-stat-sep">/</span>{{ displayMaxHp }}</span>
        <span v-if="displayTempHp" class="mc-stat-temp">+{{ displayTempHp }} tmp</span>
      </div>
      <div class="mc-stat-ac">
        <span class="mc-stat-label">AC</span>
        <span class="mc-stat-value">{{ displayAc }}</span>
      </div>
    </div>

    <!-- Row 3: HP adjust controls -->
    <div class="mc-hp-controls" @click.stop>
      <button class="hp-btn hp-btn-lg" @click="handleAdjustHp(-1)">−</button>
      <AppInput
        v-model.lazy="hpFieldModel"
        type="number"
        min="0"
        :max="displayMaxHp"
        tone="filled"
        size="lg"
        align="center"
        :block="false"
        class="w-16 h-8 font-bold"
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
      <AppCheckbox v-if="canCrit" v-model="quickCritical" size="sm" label="Critical hit" label-role="caption" />
      <AppButton variant="tinted" tone="success" emphasis="outline" size="xs" label="Heal" @click="quickHeal" />
      <AppButton variant="tinted" tone="info" emphasis="outline" size="xs" label="+Temp" @click="quickTemp" />
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
        :title="`${cond}, tap to remove\n\n${getConditionDescription(cond, ruleset)}`"
        @click="store.toggleCondition(combatant.instance_id, cond)"
      >{{ cond }} ×</span>
      <button
        v-if="store.started"
        type="button"
        class="reaction-chip"
        :class="combatant.reactionUsed ? 'reaction-used' : 'reaction-ready'"
        :title="combatant.reactionUsed ? 'Reaction used, tap to restore' : 'Reaction available, tap to mark used'"
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
import { computed } from "vue";
import { IconHide, IconReveal } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import ExhaustionChip from "@/components/common/ExhaustionChip.vue";
import ConditionPicker from "@/components/encounters/ConditionPicker.vue";
import RunnerInitiativeField from "@/components/encounters/RunnerInitiativeField.vue";
import RunnerRollStatus from "@/components/encounters/RunnerRollStatus.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { getExhaustionLevel, getConditionDescription } from "@/rules/conditions";
import { useRunnerCombatant } from "@/composables/encounters/useRunnerCombatant";
import type { RunCombatant } from "@/types/encounter.types";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { formPortrait } from "@/lib/wildshapePortrait";

const { combatant, selectedId } = defineProps<{
  combatant: RunCombatant;
  selectedId: string | null;
}>();

const emit = defineEmits<{ select: [id: string | null] }>();

const store = useEncounterRunStore();
const { ruleset } = useTableRuleset();

const {
  wildshape,
  displayHp,
  displayMaxHp,
  displayTempHp,
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
  quickCritical,
  canCrit,
  quickDamage,
  quickHeal,
  quickTemp,
  onExhaustionChange,
  onConditionPickerPick,
  handleCycleReveal,
} = useRunnerCombatant(() => combatant);

const portrait = computed(() => formPortrait(combatant, wildshape.value));

function toggleDetail() {
  emit("select", selectedId === combatant.instance_id ? null : combatant.instance_id);
}

// AppInput's `.lazy` modifier commits the raw string on change (blur/Enter),
// same as the hand-rolled `:value` + `@change` this replaces — the setter
// mirrors the original `Number((e.target as HTMLInputElement).value)` parse.
const hpFieldModel = computed<string | number>({
  get: () => displayHp.value,
  set: (raw) => handleSetHp(Number(raw)),
});
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
  @apply w-full h-full flex items-center justify-center text-label-lg font-bold;
}

.reveal-btn {
  @apply absolute bottom-0 right-0 flex items-center justify-center w-4 h-4 rounded-tl text-2xs transition-colors;
}
.reveal-hidden   { @apply bg-muted/80 text-muted-foreground hover:bg-tone-caution/80 hover:text-on-caution; }
.reveal-unseen   { @apply bg-tone-caution/80 text-on-caution hover:bg-tone-success/80 hover:text-on-success; }
.reveal-revealed { @apply bg-tone-success/80 text-on-success hover:bg-muted/80 hover:text-muted-foreground; }

/* ── Shared badge + chip styles ─────────────────────────────────────────── */
.combatant-name {
  @apply text-heading-sm font-semibold text-foreground;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-badge {
  @apply text-eyebrow font-bold px-1.5 py-0.5 rounded uppercase;
}
.type-badge.player  { @apply bg-primary/20 text-primary; }
.type-badge.monster { @apply bg-muted text-muted-foreground; }

.dead-badge { @apply text-destructive text-xs; }

.wildshape-row-badge {
  @apply text-caption-sm text-ink-caution italic ml-1;
}

.surprised-set-btn {
  @apply text-label text-muted-foreground/50 px-1 py-0.5 rounded border border-dashed border-muted-foreground/20 hover:text-ink-caution hover:border-tone-caution/40 transition-colors;
}

.cond-badge {
  @apply inline-flex items-center px-1.5 py-0.5 rounded text-label font-semibold bg-tone-caution/20 text-ink-caution  border border-tone-caution/30 cursor-pointer hover:bg-destructive/20 hover:text-destructive transition-colors;
}

.reaction-chip {
  @apply inline-flex items-center px-1.5 py-0.5 rounded text-label font-semibold border transition-colors cursor-pointer;
}
.reaction-ready { @apply bg-tone-info/10 text-ink-info border-tone-info/30 hover:bg-tone-info/20; }
.reaction-used  { @apply bg-muted text-muted-foreground/40 border-border line-through hover:bg-tone-danger/10 hover:text-destructive hover:border-tone-danger/30; }

/* ── Shared HP styles ───────────────────────────────────────────────────── */
.hp-btn {
  @apply w-6 h-6 rounded bg-muted border border-border text-heading-sm font-bold flex items-center justify-center hover:bg-card transition-colors;
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
.damage-flash.is-heal   { @apply text-ink-success; }

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
  width: 0.1875rem;
  border-radius: 0 0.125rem 0.125rem 0;
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
  /* The INIT group grew a roll button — wrap rather than overflow on the
     narrowest phones. */
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-left: 3.125rem;
  font-family: var(--font-cinzel, serif);
  font-size: 0.75rem;
}

.mc-stat-init,
.mc-stat-hp,
.mc-stat-ac {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.mc-stat-label { @apply text-label text-muted-foreground; }
.mc-stat-value { @apply text-heading-sm font-bold text-foreground; }
.mc-stat-sep   { @apply text-muted-foreground font-normal mx-0.5; }
.mc-stat-temp  { @apply text-label font-bold text-ink-info; }

.mc-hp-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-left: 3.125rem;
  position: relative;
}

.hp-btn-lg  { @apply w-8 h-8 text-base; }

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
