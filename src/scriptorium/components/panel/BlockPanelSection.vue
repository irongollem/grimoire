<template>
  <div data-testid="panel-block">
    <PanelSection>
      <h2 class="text-eyebrow uppercase text-primary">{{ name }}</h2>
      <p class="text-body text-foreground">A block on this page.</p>
    </PanelSection>

    <PanelSection v-if="lookLabel !== null" title="Look">
      <p class="text-body text-foreground" data-testid="panel-block-look">{{ lookLabel }}</p>
      <p class="text-caption text-muted-foreground">{{ lookNote }}</p>
      <AppButton variant="link" size="sm" label="Book settings" class="self-start" @click="emit('openSettings')" />
    </PanelSection>

    <PanelSection v-if="rows !== null" title="Rows">
      <SegmentedControl :model-value="rows" :options="ROW_OPTIONS" size="xs" block @update:model-value="(v) => emit('rows', v)" />
      <p class="text-caption text-muted-foreground">The look's own rows, striped, or plain. Striping is left out when printing to save ink.</p>
    </PanelSection>

    <PanelSection title="On the page">
      <AppCheckbox
        size="sm"
        label="Keep on one page"
        hint="The page does not split this block. If it does not fit, it moves to the next page whole."
        :model-value="keep"
        @update:model-value="emit('keep', $event)"
      />
      <AppCheckbox
        v-if="canSpan"
        size="sm"
        label="Across both columns"
        :model-value="across"
        @update:model-value="emit('across', $event)"
      />
    </PanelSection>
  </div>
</template>

<script setup lang="ts">
/**
 * A box or table on the page (#1176 frame 13): a read-aloud, a sidebar or stat
 * block, a quote, a callout, a table or the wide block. Its look is the book's
 * and is told, not chosen here; what it does on the page is chosen.
 */
import { computed } from "vue";
import type { TableRows } from "@/scriptorium/lib/tableRows";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import PanelSection from "@/scriptorium/components/panel/PanelSection.vue";

const { family, canSpan } = defineProps<{
  /** "Read-aloud", "Sidebar", "Table"... */
  name: string;
  /** The look the block wears, by name. */
  lookLabel: string | null;
  /** A book's look or a handout's paper. */
  family: "book" | "paper" | null;
  keep: boolean;
  /** The block sits across both columns. */
  across: boolean;
  /** Only a book in two columns has columns to span. */
  canSpan: boolean;
  /** A table's row fills; null for a block that is not a table. */
  rows: TableRows | null;
}>();
const emit = defineEmits<{
  keep: [value: boolean];
  across: [value: boolean];
  rows: [value: TableRows];
  openSettings: [];
}>();

const ROW_OPTIONS: SegmentedOption<TableRows>[] = [
  { value: "look", label: "The look's" },
  { value: "striped", label: "Striped" },
  { value: "plain", label: "Plain" },
];

const lookNote = computed(() =>
  family === "book"
    ? "Every block wears the book's look. Change the book in Book settings and every read-aloud, sidebar and stat block changes with it."
    : "Every block wears the paper's look. Change the paper in Book settings and every block changes with it.",
);
</script>
