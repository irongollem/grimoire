<template>
  <AppModal
    :open="pending !== null"
    size="md"
    labelled-by="manual-roll-title"
    :backdrop-dismiss="false"
    @close="cancel"
  >
    <div class="px-5 pt-5 pb-3">
      <h2
        id="manual-roll-title"
        class="font-cinzel text-sm font-bold text-foreground tracking-wide"
      >
        Enter your dice roll
      </h2>
      <p class="mt-1 text-body text-muted-foreground leading-snug">
        {{ pending?.label }} — roll your physical dice and enter the result{{
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

      <div v-if="pending && pending.modifier !== 0" class="pt-1 text-caption text-muted-foreground">
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
  </AppModal>
</template>

<script setup lang="ts">
/**
 * `backdropDismiss: false`, for the same reason as `ConfirmDialog` (#746): the
 * app is *waiting* on this roll, so a stray click beside the panel should not
 * silently abandon whatever asked for it. Escape still cancels — resolving
 * null, which every caller already handles as "no roll".
 */
import { computed, ref, watch } from "vue";
import type { DieSize } from "@/lib/dice/dice";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";

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

