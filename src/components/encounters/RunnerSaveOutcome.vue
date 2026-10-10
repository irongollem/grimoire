<template>
  <ul class="saves" data-testid="save-outcome">
    <li v-for="(r, i) in results" :key="r.target.instance_id" class="save-row">
      <div class="save-head">
        <span class="save-name">{{ r.target.name }}</span>
        <span class="save-roll">{{ rollText(r) }}</span>
      </div>
      <div class="save-controls">
        <SegmentedControl
          :model-value="choice(r)"
          :options="CHOICES"
          size="md"
          :disabled="locked"
          @update:model-value="emit('override', i, $event === 'success')"
        />
        <div v-if="needsTotal(r)" class="save-total">
          <AppInput
            v-model.number="totals[r.target.instance_id]"
            type="number"
            size="sm"
            :block="false"
            align="center"
            class="save-total-input"
            :disabled="locked"
            placeholder="Total"
            :aria-label="`${r.target.name}'s total`"
          />
          <AppButton
            variant="tinted"
            tone="primary"
            size="sm"
            label="Set"
            :disabled="locked || !isTotal(totals[r.target.instance_id])"
            @click="settle(i, r)"
          />
        </div>
      </div>
      <p v-if="needsTotal(r)" class="save-hint">Player's total</p>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { reactive } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import type { SaveTargetResult } from "@/composables/encounters/useActionResolution";

const CHOICES = [
  { value: "success", label: "Success" },
  { value: "fail", label: "Fail" },
];

const { results, locked = false } = defineProps<{
  results: SaveTargetResult[];
  locked?: boolean;
}>();

const emit = defineEmits<{
  override: [index: number, success: boolean];
  settle: [index: number, total: number];
}>();

/** What each party member's player said they rolled, typed in before it is set. */
const totals = reactive<Record<string, number | null>>({});

function isTotal(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** A party member has no stat block, so there is no die to roll for them. */
function needsTotal(r: SaveTargetResult): boolean {
  return r.bonus === null && !r.autoFail;
}

function choice(r: SaveTargetResult): "success" | "fail" | "" {
  if (r.success === null) return "";
  return r.success ? "success" : "fail";
}

function rollText(r: SaveTargetResult): string {
  const ability = r.ability.toUpperCase();
  if (r.autoFail) return `${ability} · auto-fail`;
  if (r.total !== null) return `${r.total} vs DC ${r.dc}`;
  if (r.bonus === null) return `${ability} · DC ${r.dc}`;
  return `${ability} · not rolled`;
}

function settle(index: number, r: SaveTargetResult) {
  const total = totals[r.target.instance_id];
  if (isTotal(total)) emit("settle", index, total);
}
</script>

<style scoped>
@reference "@/assets/main.css";

.saves {
  @apply flex flex-col gap-2;
}

.save-row {
  @apply flex flex-col gap-1 rounded-md border border-border px-2 py-1.5;
}

.save-head {
  @apply flex flex-wrap items-baseline justify-between gap-2;
}

.save-name {
  @apply text-label-lg font-semibold text-foreground;
}

.save-roll {
  @apply text-caption text-muted-foreground;
}

.save-controls {
  @apply flex flex-wrap items-center gap-2;
}

.save-total {
  @apply flex items-center gap-1;
}

.save-total-input {
  width: 5rem;
}

.save-hint {
  @apply text-caption text-muted-foreground;
}
</style>
