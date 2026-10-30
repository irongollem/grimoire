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
            :src="portrait.src"
            :placeholder="placeholderUrl(placeholderKind(combatant, portrait))"
            :alt="portrait.alt"
            :focal-point="portrait.focalPoint"
            format="square"
          />
          <AppButton
            v-if="combatant.type === 'monster'"
            variant="tinted"
            :tone="revealTone(combatant.reveal_state)"
            :emphasis="combatant.reveal_state === 'hidden' || !combatant.reveal_state ? 'strong' : 'solid'"
            size="icon-2xs"
            class="reveal-btn"
            :icon="combatant.reveal_state === 'hidden' || !combatant.reveal_state ? IconHide : IconReveal"
            :tooltip="revealBtnTitle(combatant.reveal_state)"
            :aria-label="revealBtnTitle(combatant.reveal_state)"
            @click.stop="handleCycleReveal"
          />
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
          tooltip="Surprised: click to remove"
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
          @update:model-value="(v) => handleSetHp(v)"
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
          title="Max HP: edit to raise or lower on the fly"
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
        <RunnerConditionBadges :combatant="combatant" />
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
      <AppCheckbox v-if="canCrit" v-model="quickCritical" size="sm" label="Critical hit" label-role="caption" />
      <AppButton variant="tinted" tone="success" emphasis="outline" size="xs" label="Heal" @click="quickHeal" />
      <AppButton variant="tinted" tone="info" emphasis="outline" size="xs" label="+Temp" @click="quickTemp" />
      <span v-if="displayTempHp" class="quick-temp-display">{{ displayTempHp }} tmp</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconHide, IconReveal } from '@/lib/icons';
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import RunnerConditionBadges from "@/components/encounters/RunnerConditionBadges.vue";
import RunnerInitiativeField from "@/components/encounters/RunnerInitiativeField.vue";
import RunnerRollStatus from "@/components/encounters/RunnerRollStatus.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useRunnerCombatant } from "@/composables/encounters/useRunnerCombatant";
import type { RunCombatant } from "@/types/encounter.types";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { useFormPortraits } from "@/composables/party/useFormPortraits";
import { placeholderKind } from "@/lib/wildshapePortrait";
import { computed } from "vue";

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
  displayTempHp,
  displayAc,
  factionColor,
  revealTone,
  revealBtnTitle,
  flashInfo,
  clearFlash,
  handleAdjustHp,
  handleSetHp,
  handleSetMaxHp,
  quickAmount,
  quickCritical,
  canCrit,
  quickDamage,
  quickHeal,
  quickTemp,
  handleCycleReveal,
} = useRunnerCombatant(() => combatant);

const portraitOf = useFormPortraits(() => [wildshape.value]);
const portrait = computed(() => portraitOf(combatant, wildshape.value));

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
  box-shadow: inset 0 0 0 2px theme(colors.primary / 100%);
}

.avatar-initials {
  @apply w-full h-full flex items-center justify-center text-label-lg font-bold;
}

.reveal-btn { @apply absolute bottom-0 right-0 rounded-none rounded-tl; }

/* ── Shared badge + chip styles ─────────────────────────────────────────── */
.combatant-name {
  @apply text-heading-sm font-semibold text-foreground hover:text-primary transition-colors;
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

/* ── Quick HP panel styles ──────────────────────────────────────────────── */
.quick-temp-display {
  margin-left: auto;
  font-family: var(--font-cinzel, serif);
  font-size: 0.625rem;
  font-weight: 700;
  color: theme(colors.ink-info);
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

.hp-max { @apply text-label-lg text-muted-foreground; }

.ac-cell  { @apply flex items-center justify-center; }
.ac-value { @apply text-heading-sm font-bold text-foreground text-center; }

.conditions-cell { @apply flex items-center flex-wrap gap-1; }

/* A narrow list (the stat block panel open beside it) has no room for a
   conditions column: the name and the conditions split one column between
   them and starved the name to a letter or two. The conditions move under the
   name instead, and the cells either side span both lines. */
@container runner-list (max-width: 44rem) {
  .combatant-row {
    grid-template-columns: 2.5rem 4.75rem minmax(0, 1fr) 10rem 3rem;
    grid-template-rows: auto auto;
    row-gap: 0.125rem;
    padding-block: 0.25rem;
  }
  .avatar-cell,
  .init-cell,
  .hp-cell,
  .ac-cell {
    grid-row: 1 / span 2;
  }
  .name-cell {
    grid-column: 3;
    grid-row: 1;
    align-self: end;
  }
  .conditions-cell {
    grid-column: 3;
    grid-row: 2;
    align-self: start;
  }
}

.hp-quick-panel {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem 0.375rem 3rem;
  background: theme(colors.muted / 15%);
  border-top: 1px solid theme(colors.border / 40%);
}
</style>
