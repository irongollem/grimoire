<template>
  <div class="relative">
    <!-- Trigger button -->
    <button
      ref="triggerRef"
      type="button"
      class="dice-trigger"
      :class="{ 'is-open': isOpen }"
      title="Dice Roller"
      @click="togglePanel"
    >
      <IconDiceRoll class="h-4 w-4" />
    </button>

    <!-- Foldout panel + backdrop, teleported to <body> so they escape the
         sidebar's sticky stacking context (otherwise <main> paints over them). -->
    <Teleport to="body">
      <div v-if="isOpen" class="dice-backdrop" @click="closePanel" />
      <Transition name="dice-panel">
        <div
          v-if="isOpen"
          ref="panelRef"
          class="dice-panel"
          :style="panelStyle"
          @click.stop
        >
        <!-- Header -->
        <div class="dice-panel-header">
          <span
            class="text-label-lg font-bold text-foreground"
            >Dice Roller</span
          >
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground text-lg leading-none"
            @click="closePanel"
          >
            ×
          </button>
        </div>

        <!-- Dice grid -->
        <div class="dice-grid">
          <div v-for="d in DICE" :key="d.sides" class="die-slot">
            <button
              type="button"
              class="die-btn"
              :class="{ 'die-active': counts[d.sides] > 0 }"
              @click="toggleDie(d.sides)"
            >
              <component :is="d.icon" class="die-icon" />
              <span class="die-label">d{{ d.sides }}</span>
            </button>
            <div class="die-count-row">
              <button
                type="button"
                class="count-btn"
                @click="decrement(d.sides)"
              >
                −
              </button>
              <span class="count-val">{{ counts[d.sides] }}</span>
              <button
                type="button"
                class="count-btn"
                @click="increment(d.sides)"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <!-- Modifier -->
        <div class="modifier-row">
          <span
            class="text-label text-muted-foreground"
            >MODIFIER</span
          >
          <div class="modifier-input-wrap">
            <button type="button" class="count-btn" @click="modifier--">
              −
            </button>
            <input
              v-model.number="modifier"
              type="number"
              class="modifier-input"
              @click.stop
            />
            <button type="button" class="count-btn" @click="modifier++">
              +
            </button>
          </div>
        </div>

        <!-- Advantage / Normal / Disadvantage (only relevant when d20 included) -->
        <div class="adv-row">
          <button
            v-for="m in MODES"
            :key="m.value"
            type="button"
            class="adv-btn"
            :class="{
              'adv-active': mode === m.value,
              [m.cls]: mode === m.value,
            }"
            @click="mode = m.value"
          >
            {{ m.label }}
          </button>
        </div>

        <!-- Roll button -->
        <button
          type="button"
          class="roll-btn"
          :disabled="totalDice === 0"
          @click="roll"
        >
          Roll {{ rollLabel }}
        </button>

        <!-- Result -->
        <Transition name="result-fade">
          <div v-if="result" class="result-panel">
            <div class="result-total">
              <DiceResult
                :value="result.total"
                :is-crit="result.isCrit"
                :is-fumble="result.isFumble"
                :max-random="maxResultRandom"
              />
            </div>
            <div
              class="result-label text-label text-muted-foreground text-center"
            >
              {{ result.label }}
            </div>
            <div class="result-breakdown">
              <span
                v-for="(r, i) in result.breakdown"
                :key="i"
                class="result-die"
                :class="{ 'result-die-dropped': r.dropped }"
              >
                {{ r.val }}
              </span>
              <span v-if="result.modifier !== 0" class="result-mod">
                {{ result.modifier > 0 ? "+" : "" }}{{ result.modifier }}
              </span>
            </div>
          </div>
        </Transition>

          <!-- Quick clear -->
          <button type="button" class="clear-btn" @click="clearAll">Clear</button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onBeforeUnmount, type Component } from "vue";
import { IconDiceRoll, IconDie4, IconDie6, IconDie8, IconDie10, IconDie12, IconDie20, IconDie100 } from '@/lib/icons';
import DiceResult from "@/components/common/DiceResult.vue";
import { primeDiceAudio } from "@/lib/diceAudio";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import type { DieSize, RollMode, RollResult } from "@/lib/roller";

const DICE: { sides: DieSize; icon: Component }[] = [
  { sides: 4, icon: IconDie4 },
  { sides: 6, icon: IconDie6 },
  { sides: 8, icon: IconDie8 },
  { sides: 10, icon: IconDie10 },
  { sides: 12, icon: IconDie12 },
  { sides: 20, icon: IconDie20 },
  { sides: 100, icon: IconDie100 },
];

const MODES: { value: RollMode; label: string; cls: string }[] = [
  { value: "disadvantage", label: "DIS", cls: "adv-dis" },
  { value: "normal", label: "Normal", cls: "adv-normal" },
  { value: "advantage", label: "ADV", cls: "adv-adv" },
];

const isOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
// The panel is teleported to <body> and fixed-positioned from the trigger's
// viewport rect, so it sits above all page content without any z-index games.
// It folds away from whichever screen edge it would otherwise overflow.
const panelStyle = ref<Record<string, string>>({});

function positionPanel() {
  const trigger = triggerRef.value;
  const panel = panelRef.value;
  if (!trigger || !panel) return;
  const t = trigger.getBoundingClientRect();
  const pw = panel.offsetWidth;
  const ph = panel.offsetHeight;
  const gap = 8;
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Horizontal: prefer aligning the panel's right edge to the trigger's (fold
  // left). If that clips the left edge, fold right from the trigger's left.
  let left = t.right - pw;
  if (left < margin) left = t.left;
  left = Math.min(Math.max(left, margin), vw - pw - margin);

  // Vertical: prefer dropping below the trigger; flip above if it would clip.
  let top = t.bottom + gap;
  if (top + ph > vh - margin && t.top - gap - ph >= margin) top = t.top - gap - ph;
  top = Math.min(Math.max(top, margin), vh - ph - margin);

  panelStyle.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` };
}

function togglePanel() {
  if (isOpen.value) {
    closePanel();
    return;
  }
  isOpen.value = true;
  primeDiceAudio();
  nextTick(positionPanel);
  window.addEventListener("resize", positionPanel);
  window.addEventListener("scroll", positionPanel, true);
}

function closePanel() {
  isOpen.value = false;
  window.removeEventListener("resize", positionPanel);
  window.removeEventListener("scroll", positionPanel, true);
}

onBeforeUnmount(closePanel);

const counts = reactive<Record<DieSize, number>>({
  4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 1, 100: 0,
});
const modifier = ref(0);
const mode = ref<RollMode>("normal");
const result = ref<RollResult | null>(null);

const totalDice = computed(() => Object.values(counts).reduce((s, c) => s + c, 0));

const rollLabel = computed(() => {
  const parts: string[] = [];
  for (const d of DICE) {
    if (counts[d.sides] > 0) parts.push(`${counts[d.sides]}d${d.sides}`);
  }
  let label = parts.join(" + ") || "—";
  if (modifier.value !== 0)
    label += modifier.value > 0 ? ` +${modifier.value}` : ` ${modifier.value}`;
  return label;
});

/** Upper bound for scramble range — highest die currently selected, or 20. */
const maxResultRandom = computed(() => {
  let max = 0;
  for (const d of DICE) {
    if (counts[d.sides] > 0 && d.sides > max) max = d.sides;
  }
  return max || 20;
});

function toggleDie(sides: DieSize) { counts[sides] = counts[sides] > 0 ? 0 : 1; }
function increment(sides: DieSize) { counts[sides] = Math.min(counts[sides] + 1, 9); }
function decrement(sides: DieSize) { counts[sides] = Math.max(counts[sides] - 1, 0); }

const { promptRoll } = usePromptedRoll();

async function roll() {
  const r = await promptRoll({
    counts,
    modifier: modifier.value,
    label: rollLabel.value,
    mode: mode.value,
    silent: true,
  });
  if (r) result.value = r;
}

function clearAll() {
  for (const d of DICE) counts[d.sides] = 0;
  counts[20] = 1;
  modifier.value = 0;
  mode.value = "normal";
  result.value = null;
}
</script>

<style scoped>
@reference "@/assets/main.css";

.dice-trigger {
  @apply inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors;
}
.dice-trigger.is-open {
  @apply text-primary border-primary/50 bg-primary/5;
}

.dice-backdrop {
  @apply fixed inset-0 z-50;
}
.dice-panel {
  @apply fixed z-50 w-72 max-h-[calc(100dvh-1rem)] overflow-y-auto bg-card border border-border rounded-xl shadow-2xl flex flex-col gap-3 p-4;
}

.dice-panel-header {
  @apply flex items-center justify-between;
}

.dice-grid {
  @apply grid grid-cols-4 gap-2;
}

.die-slot {
  @apply flex flex-col items-center gap-1;
}

.die-btn {
  @apply flex flex-col items-center justify-center w-full aspect-square rounded-lg border border-border bg-muted/40 hover:border-primary/60 hover:bg-primary/5 transition-colors gap-0.5 py-1.5;
  touch-action: manipulation;
}
.die-active {
  @apply border-primary/60 bg-primary/10 text-primary;
}

.die-icon {
  @apply h-5 w-5 text-foreground;
}
.die-label {
  @apply text-label font-bold text-muted-foreground;
}

.die-count-row {
  @apply flex items-center gap-1;
}
.count-btn {
  @apply w-5 h-5 rounded bg-muted border border-border font-cinzel text-xs flex items-center justify-center hover:bg-card transition-colors leading-none;
  touch-action: manipulation;
}
.count-val {
  @apply font-cinzel text-xs font-bold text-foreground w-4 text-center;
}

.modifier-row {
  @apply flex items-center justify-between gap-2;
}
.modifier-input-wrap {
  @apply flex items-center gap-1;
}
.modifier-input {
  @apply w-14 text-center bg-muted border border-border rounded px-1 py-0.5 font-cinzel text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}

.adv-row {
  @apply flex rounded-lg overflow-hidden border border-border;
}
.adv-btn {
  @apply flex-1 py-1.5 text-label font-bold text-muted-foreground hover:text-foreground transition-colors;
}
.adv-active {
  @apply text-foreground;
}
.adv-dis.adv-active {
  @apply bg-destructive/20 text-destructive;
}
.adv-normal.adv-active {
  @apply bg-muted text-foreground;
}
.adv-adv.adv-active {
  @apply bg-green-500/20 text-green-600 dark:text-green-400;
}

.roll-btn {
  @apply w-full py-2 text-label-lg font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40;
}

.result-panel {
  @apply flex flex-col items-center gap-1 bg-muted/40 rounded-lg px-3 py-2;
}
.result-total {
  @apply text-display font-bold text-foreground;
}
.result-crit {
  @apply text-amber-500;
}
.result-fumble {
  @apply text-destructive;
}
.result-breakdown {
  @apply flex flex-wrap items-center justify-center gap-1 mt-0.5;
}
.result-die {
  @apply font-cinzel text-xs font-semibold bg-muted rounded px-1.5 py-0.5 text-foreground;
}
.result-die-dropped {
  @apply line-through text-muted-foreground opacity-50;
}
.result-mod {
  @apply font-cinzel text-xs font-semibold text-primary;
}

.clear-btn {
  @apply w-full py-1 text-label text-muted-foreground hover:text-foreground transition-colors;
}

/* Transitions */
.dice-panel-enter-active,
.dice-panel-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.dice-panel-enter-from,
.dice-panel-leave-to {
  opacity: 0;
  transform: translateY(-0.375rem) scale(0.97);
}
.result-fade-enter-active,
.result-fade-leave-active {
  transition: opacity 0.2s ease;
}
.result-fade-enter-from,
.result-fade-leave-to {
  opacity: 0;
}
</style>
