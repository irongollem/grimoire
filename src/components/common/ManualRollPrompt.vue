<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="pending"
        class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="cancel"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <div
          class="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-roll-title"
        >
          <div class="px-5 pt-5 pb-3">
            <h2
              id="manual-roll-title"
              class="font-cinzel text-sm font-bold text-foreground tracking-wide"
            >
              Enter your dice roll
            </h2>
            <p class="mt-1 text-body text-muted-foreground leading-snug">
              {{ pending.label }} — roll your physical dice and enter the result{{
                totalDice > 1 ? "s" : ""
              }}.
            </p>
          </div>

          <div class="px-5 pb-3 space-y-3">
            <div
              v-for="row in rows"
              :key="row.sides"
              class="flex items-center gap-2"
            >
              <span
                class="w-14 shrink-0 text-label-lg font-semibold uppercase text-muted-foreground"
              >
                d{{ row.sides }}
              </span>
              <div class="flex flex-wrap gap-1.5">
                <AppInput
                  v-for="(_, i) in row.inputs"
                  :key="i"
                  v-model.number="row.inputs[i]"
                  type="number"
                  :min="1"
                  :max="row.sides"
                  :placeholder="'1–' + row.sides"
                  size="body-xs"
                  align="center"
                  :block="false"
                  class="w-16 font-mono"
                />
              </div>
              <span
                v-if="row.advLabel"
                class="ml-1 text-eyebrow text-muted-foreground"
              >
                {{ row.advLabel }}
              </span>
            </div>

            <div v-if="pending.modifier !== 0" class="pt-1 text-caption text-muted-foreground">
              Modifier: <span class="font-semibold text-foreground">{{
                pending.modifier > 0 ? `+${pending.modifier}` : pending.modifier
              }}</span>
            </div>
            <div class="text-caption text-muted-foreground">
              Running total:
              <span class="font-semibold text-foreground">{{ runningTotal }}</span>
              <span v-if="!allFilled" class="italic"> (incomplete)</span>
            </div>
          </div>

          <div class="flex justify-end gap-2 px-5 pb-5 pt-2">
            <AppButton variant="subtle" size="sm" label="Cancel" @click="cancel" />
            <AppButton
              variant="primary"
              size="sm"
              label="Submit"
              :disabled="!allFilled"
              @click="submit"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { DieSize } from "@/lib/dice/dice";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";

const { pending, _resolveManual } = usePromptedRoll();

interface Row {
  sides: DieSize;
  inputs: (number | null)[];
  advLabel: string;
}

const rows = ref<Row[]>([]);

watch(
  pending,
  (p) => {
    if (!p) {
      rows.value = [];
      return;
    }
    const next: Row[] = [];
    for (const sides of [4, 6, 8, 10, 12, 20, 100] as DieSize[]) {
      const n = p.counts[sides] ?? 0;
      if (n === 0) continue;
      const isAdv = sides === 20 && n === 1 && p.mode !== "normal";
      next.push({
        sides,
        inputs: Array.from({ length: isAdv ? 2 : n }, () => null),
        advLabel: isAdv ? (p.mode === "advantage" ? "Advantage (keep higher)" : "Disadvantage (keep lower)") : "",
      });
    }
    rows.value = next;
  },
  { immediate: true },
);

const totalDice = computed(() =>
  rows.value.reduce((s, r) => s + r.inputs.length, 0),
);

function clamp(sides: DieSize, val: number | null): number | null {
  if (val === null || val === undefined || Number.isNaN(val)) return null;
  if (val < 1 || val > sides) return null;
  return Math.floor(val);
}

const allFilled = computed(() =>
  rows.value.every((r) =>
    r.inputs.every((v) => clamp(r.sides, v) !== null),
  ),
);

const runningTotal = computed(() => {
  const p = pending.value;
  if (!p) return 0;
  let sum = p.modifier;
  for (const r of rows.value) {
    const vals = r.inputs.map((v) => clamp(r.sides, v)).filter((v): v is number => v !== null);
    if (vals.length === 0) continue;
    if (r.sides === 20 && (p.counts[20] ?? 0) === 1 && p.mode !== "normal" && vals.length === 2) {
      sum += p.mode === "advantage" ? Math.max(vals[0], vals[1]) : Math.min(vals[0], vals[1]);
    } else {
      sum += vals.reduce((s, v) => s + v, 0);
    }
  }
  return sum;
});

function submit() {
  if (!allFilled.value) return;
  const values: Partial<Record<DieSize, number[]>> = {};
  for (const r of rows.value) {
    values[r.sides] = r.inputs.map((v) => clamp(r.sides, v) as number);
  }
  _resolveManual(values as Record<DieSize, number[]>);
}

function cancel() {
  _resolveManual(null);
}
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.15s ease;
}
.dialog-fade-enter-active .relative,
.dialog-fade-leave-active .relative {
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}
.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
.dialog-fade-enter-from .relative,
.dialog-fade-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>
