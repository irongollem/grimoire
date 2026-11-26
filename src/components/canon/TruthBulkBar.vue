<template>
  <div class="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm" data-testid="truth-bulk-bar">
    <span aria-live="polite" class="text-label-lg text-foreground" data-testid="bulk-count">{{ count }} selected</span>
    <AppButton variant="ghost" size="sm" label="Select all shown" @click="emit('selectAll')" />
    <AppButton variant="ghost" size="sm" label="Clear" :disabled="count === 0" @click="emit('clear')" />
    <div class="ml-auto flex flex-wrap items-center gap-2">
      <AppSelect :key="`arc-${resets}`" model-value="" tone="filled" weight="normal" size="body" aria-label="File the selected truths in an arc" :disabled="busy || count === 0" data-testid="bulk-arc" @update:model-value="fileInArc">
        <option value="" disabled>File in arc…</option>
        <option value="none">No arc</option>
        <option v-for="arc in arcs" :key="arc.id" :value="arc.id">{{ arc.name }}</option>
      </AppSelect>
      <AppSelect :key="`mark-${resets}`" model-value="" tone="filled" weight="normal" size="body" aria-label="Mark the selected truths" :disabled="busy || count === 0" data-testid="bulk-mark" @update:model-value="markAs">
        <option value="" disabled>Mark as…</option>
        <option v-for="m in MARK_OPTIONS" :key="m.value" :value="m.value">{{ m.label }}</option>
      </AppSelect>
      <AppButton variant="ghost" size="sm" label="Done" @click="emit('stop')" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The bar above the Truths list while the DM is selecting (#1279 item 33): file the chosen truths in an arc, or give them
 * a mark, in one go. It only says what to write; the chapter writes it against the rows still on screen. Marking as
 * "known to some" changes the mark alone, so a truth keeps the people already named as knowing it.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { useCanonArcs } from "@/composables/canon/useCanonArcs";
import { MARK_OPTIONS } from "@/lib/canon/canonParts";
import type { KnowledgeMark } from "@/types/canon.types";
import { computed, ref } from "vue";

defineProps<{ count: number; busy: boolean }>();
const emit = defineEmits<{ selectAll: []; clear: []; stop: []; fileInArc: [arcId: string | null, name: string]; markAs: [mark: KnowledgeMark, label: string] }>();

const { data } = useCanonArcs();
const arcs = computed(() => data.value ?? []);
// A native select keeps the option just chosen; remounting puts the prompt back so it can be used again.
const resets = ref(0);

function fileInArc(value: string | null) {
  resets.value += 1;
  if (!value) return;
  emit("fileInArc", value === "none" ? null : value, value === "none" ? "no arc" : (arcs.value.find((a) => a.id === value)?.name ?? "that arc"));
}
function markAs(value: string | null) {
  resets.value += 1;
  const mark = MARK_OPTIONS.find((m) => m.value === value);
  if (mark) emit("markAs", mark.value, mark.label);
}
</script>
