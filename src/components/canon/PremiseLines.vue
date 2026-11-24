<template>
  <CanonBlock :title="title" :data-testid="`premise-${kinds.join('-')}`">
    <ul v-if="rows.length > 0" class="flex flex-col rounded-lg border border-border bg-card">
      <PremiseLineRow
        v-for="row in rows"
        :key="row.id"
        :entry="row"
        :label="itemLabel"
        :move="endsOf(sameKind(row), row.id)"
        @move="(direction) => reorder(sameKind(row), row.id, direction)"
      />
    </ul>
    <CanonAddRow v-model="draft" :placeholder="placeholder" :input-label="`Add: ${title}`" label="Add" :create="add">
      <SegmentedControl v-if="kinds.length > 1" v-model="kind" :options="kindOptions" class="shrink-0" :aria-label="`Kind of ${itemLabel}`" />
    </CanonAddRow>
  </CanonBlock>
</template>

<script setup lang="ts">
/** A short list of one-line premise entries of one or two kinds: themes, how it plays at the table, lines and veils. */
import { computed, ref } from "vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import CanonAddRow from "./CanonAddRow.vue";
import CanonBlock from "./kit/CanonBlock.vue";
import PremiseLineRow from "./PremiseLineRow.vue";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonReorder } from "@/composables/canon/useCanonReorder";
import { endsOf } from "@/lib/canon/canonOrder";
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
// A line moves among the lines and a veil among the veils: the two read as different things.
const sameKind = (row: CanonEntry) => rows.value.filter((r) => r.premise_kind === row.premise_kind);
const reorder = useCanonReorder();
const kindOptions = computed<SegmentedOption<PremiseKind>[]>(() => kinds.map((value) => ({ value, label: KIND_LABEL[value] ?? value })));

const draft = ref("");
const kind = ref<PremiseKind>(kinds[0]);
const { mutateAsync: create } = useCreateCanonEntry();

async function add(text: string) {
  await create({ part: "premise", premise_kind: kind.value, title: text, sort_order: rows.value.length });
}
</script>
