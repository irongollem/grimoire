<template>
  <div class="relative">
    <!-- Trigger button -->
    <button
      type="button"
      class="dice-trigger"
      :class="{ 'is-open': isOpen }"
      title="Dice Roller"
      @click="isOpen = !isOpen"
    >
      <Dices class="h-4 w-4" />
    </button>

    <!-- Foldout panel -->
    <Transition name="dice-panel">
      <div v-if="isOpen" class="dice-panel" @click.stop>
        <!-- Header -->
        <div class="dice-panel-header">
          <span class="font-cinzel text-xs font-bold tracking-wider text-foreground">Dice Roller</span>
          <button type="button" class="text-muted-foreground hover:text-foreground text-lg leading-none" @click="isOpen = false">×</button>
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
              <span class="die-icon">{{ d.icon }}</span>
              <span class="die-label">d{{ d.sides }}</span>
            </button>
            <div class="die-count-row">
              <button type="button" class="count-btn" @click="decrement(d.sides)">−</button>
              <span class="count-val">{{ counts[d.sides] }}</span>
              <button type="button" class="count-btn" @click="increment(d.sides)">+</button>
            </div>
          </div>
        </div>

        <!-- Modifier -->
        <div class="modifier-row">
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">MODIFIER</span>
          <div class="modifier-input-wrap">
            <button type="button" class="count-btn" @click="modifier--">−</button>
            <input
              v-model.number="modifier"
              type="number"
              class="modifier-input"
              @click.stop
            />
            <button type="button" class="count-btn" @click="modifier++">+</button>
          </div>
        </div>

        <!-- Advantage / Normal / Disadvantage (only relevant when d20 included) -->
        <div class="adv-row">
          <button
            v-for="m in MODES"
            :key="m.value"
            type="button"
            class="adv-btn"
            :class="{ 'adv-active': mode === m.value, [m.cls]: mode === m.value }"
            @click="mode = m.value"
          >{{ m.label }}</button>
        </div>

        <!-- Roll button -->
        <button type="button" class="roll-btn" :disabled="totalDice === 0" @click="roll">
          Roll {{ rollLabel }}
        </button>

        <!-- Result -->
        <Transition name="result-fade">
          <div v-if="result" class="result-panel">
            <div class="result-total" :class="resultClass">{{ result.total }}</div>
            <div class="result-label font-cinzel text-[10px] text-muted-foreground tracking-wider text-center">
              {{ result.label }}
            </div>
            <div class="result-breakdown">
              <span v-for="(r, i) in result.breakdown" :key="i" class="result-die" :class="{ 'result-die-dropped': r.dropped }">
                {{ r.val }}
              </span>
              <span v-if="result.modifier !== 0" class="result-mod">
                {{ result.modifier > 0 ? '+' : '' }}{{ result.modifier }}
              </span>
            </div>
          </div>
        </Transition>

        <!-- Quick clear -->
        <button type="button" class="clear-btn" @click="clearAll">Clear</button>
      </div>
    </Transition>

    <!-- Backdrop -->
    <div v-if="isOpen" class="fixed inset-0 z-[39]" @click="isOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { Dices } from "lucide-vue-next";

type DieSize = 4 | 6 | 8 | 10 | 12 | 20 | 100;
type RollMode = "normal" | "advantage" | "disadvantage";

const DICE: { sides: DieSize; icon: string }[] = [
  { sides: 4,   icon: "▲" },
  { sides: 6,   icon: "⬡" },
  { sides: 8,   icon: "◆" },
  { sides: 10,  icon: "◈" },
  { sides: 12,  icon: "⬟" },
  { sides: 20,  icon: "⬠" },
  { sides: 100, icon: "⊕" },
];

const MODES: { value: RollMode; label: string; cls: string }[] = [
  { value: "disadvantage", label: "DIS", cls: "adv-dis" },
  { value: "normal",       label: "Normal", cls: "adv-normal" },
  { value: "advantage",    label: "ADV", cls: "adv-adv" },
];

const isOpen = ref(false);
const counts = reactive<Record<DieSize, number>>({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 1, 100: 0 });
const modifier = ref(0);
const mode = ref<RollMode>("normal");

interface DieResult { val: number; dropped: boolean }
interface RollResult {
  total: number;
  label: string;
  modifier: number;
  breakdown: DieResult[];
  isCrit: boolean;
  isFumble: boolean;
}
const result = ref<RollResult | null>(null);

const totalDice = computed(() => Object.values(counts).reduce((s, c) => s + c, 0));

const rollLabel = computed(() => {
  const parts: string[] = [];
  for (const d of DICE) {
    if (counts[d.sides] > 0) parts.push(`${counts[d.sides]}d${d.sides}`);
  }
  if (modifier.value !== 0) parts.push(modifier.value > 0 ? `+${modifier.value}` : `${modifier.value}`);
  return parts.join(" + ") || "—";
});

const resultClass = computed(() => {
  if (!result.value) return "";
  if (result.value.isCrit) return "result-crit";
  if (result.value.isFumble) return "result-fumble";
  return "";
});

function toggleDie(sides: DieSize) {
  counts[sides] = counts[sides] > 0 ? 0 : 1;
}
function increment(sides: DieSize) { counts[sides] = Math.min(counts[sides] + 1, 9); }
function decrement(sides: DieSize) { counts[sides] = Math.max(counts[sides] - 1, 0); }

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function roll() {
  const breakdown: DieResult[] = [];
  let sum = 0;
  let isCrit = false;
  let isFumble = false;

  for (const d of DICE) {
    const n = counts[d.sides];
    if (n === 0) continue;
    for (let i = 0; i < n; i++) {
      if (d.sides === 20 && n === 1 && mode.value !== "normal") {
        // Advantage / disadvantage: roll twice, keep one
        const r1 = rollDie(20);
        const r2 = rollDie(20);
        const keep = mode.value === "advantage" ? Math.max(r1, r2) : Math.min(r1, r2);
        const drop = mode.value === "advantage" ? Math.min(r1, r2) : Math.max(r1, r2);
        breakdown.push({ val: keep, dropped: false });
        breakdown.push({ val: drop, dropped: true });
        sum += keep;
        if (keep === 20) isCrit = true;
        if (keep === 1) isFumble = true;
      } else {
        const r = rollDie(d.sides);
        breakdown.push({ val: r, dropped: false });
        sum += r;
        if (d.sides === 20 && r === 20) isCrit = true;
        if (d.sides === 20 && r === 1) isFumble = true;
      }
    }
  }

  const total = sum + modifier.value;
  const modeLabel = counts[20] > 0 && mode.value !== "normal"
    ? ` (${mode.value === "advantage" ? "Adv" : "Dis"})`
    : "";
  result.value = { total, label: rollLabel.value + modeLabel, modifier: modifier.value, breakdown, isCrit, isFumble };
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

.dice-panel {
  @apply absolute z-40 right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-2xl flex flex-col gap-3 p-4;
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
}
.die-active {
  @apply border-primary/60 bg-primary/10 text-primary;
}

.die-icon {
  @apply text-base leading-none text-foreground;
}
.die-label {
  @apply font-cinzel text-[9px] font-bold tracking-wider text-muted-foreground;
}

.die-count-row {
  @apply flex items-center gap-1;
}
.count-btn {
  @apply w-5 h-5 rounded bg-muted border border-border font-cinzel text-xs flex items-center justify-center hover:bg-card transition-colors leading-none;
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
  @apply flex-1 py-1.5 font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground hover:text-foreground transition-colors;
}
.adv-active { @apply text-foreground; }
.adv-dis.adv-active  { @apply bg-destructive/20 text-destructive; }
.adv-normal.adv-active { @apply bg-muted text-foreground; }
.adv-adv.adv-active  { @apply bg-green-500/20 text-green-600 dark:text-green-400; }

.roll-btn {
  @apply w-full py-2 font-cinzel text-xs font-bold tracking-wider bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40;
}

.result-panel {
  @apply flex flex-col items-center gap-1 bg-muted/40 rounded-lg px-3 py-2;
}
.result-total {
  @apply font-cinzel text-3xl font-bold text-foreground;
}
.result-crit   { @apply text-amber-500; }
.result-fumble { @apply text-destructive; }
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
  @apply w-full py-1 font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors;
}

/* Transitions */
.dice-panel-enter-active,
.dice-panel-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dice-panel-enter-from,
.dice-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
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
