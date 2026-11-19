<template>
  <div class="flex flex-col gap-1.5" :data-testid="`premise-${kinds.join('-')}`">
    <span class="text-eyebrow text-muted-foreground">{{ title }}</span>
    <ul v-if="rows.length > 0" class="flex flex-col border border-border bg-card">
      <PremiseLineRow v-for="row in rows" :key="row.id" :entry="row" :label="itemLabel" />
    </ul>
    <form class="flex items-center gap-2" @submit.prevent="add">
      <AppInput v-model="draft" tone="filled" size="body" :placeholder="placeholder" :aria-label="`Add: ${title}`" />
      <SegmentedControl
        v-if="kinds.length > 1"
        v-model="kind"
        :options="kindOptions"
        class="shrink-0"
        :aria-label="`Kind of ${itemLabel}`"
      />
      <AppButton type="submit" variant="outline" :icon="IconAdd" icon-size="xs" label="Add" :loading="isPending" :disabled="draft.trim() === ''" />
    </form>
  </div>
</template>

<script setup lang="ts">
/** A short list of one-line premise entries of one or two kinds: themes, how it plays at the table, lines and veils. */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import PremiseLineRow from "./PremiseLineRow.vue";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { IconAdd } from "@/lib/icons";
import type { CanonEntry, PremiseKind } from "@/types/canon.types";

const { title, itemLabel, placeholder, kinds, entries } = defineProps<{
  title: string;
  /** What one entry is called, for its field's accessible name ("Theme"). */
  itemLabel: string;
  placeholder: string;
  kinds: readonly [PremiseKind, ...PremiseKind[]];
  /** The premise entries of the campaign; this list shows the ones of its kinds. */
  entries: readonly CanonEntry[];
}>();

const KIND_LABEL: Partial<Record<PremiseKind, string>> = { line: "Line", veil: "Veil" };

const rows = computed(() => entries.filter((e) => e.premise_kind !== null && kinds.includes(e.premise_kind)));
const kindOptions = computed<SegmentedOption<PremiseKind>[]>(() => kinds.map((value) => ({ value, label: KIND_LABEL[value] ?? value })));

const draft = ref("");
const kind = ref<PremiseKind>(kinds[0]);
const { mutateAsync: create, isPending } = useCreateCanonEntry();

async function add() {
  const text = draft.value.trim();
  if (text === "") return;
  try {
    await create({ part: "premise", premise_kind: kind.value, title: text, sort_order: rows.value.length });
    draft.value = "";
  } catch {
    // The mutation has already told the DM (toast); the words stay in the box to try again.
  }
}
</script>
