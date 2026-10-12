<template>
  <SegmentedControl
    v-model="layout"
    :options="OPTIONS"
    variant="subtle"
    size="icon-sm"
    icon-only
    class="shrink-0"
    role="group"
    aria-label="List layout"
  />
</template>

<script setup lang="ts">
/**
 * The list/grid switch every catalogue list offers, so the experience is the
 * same everywhere: a user picks rows or cards once per list and it is
 * remembered (`useListLayout`).
 *
 * Placement rule, for every list: this is the LAST item in the page header's
 * `#actions` slot (ListPageLayout or PageHeader), at every width, for the DM
 * and the player portal alike wherever the list shows. Where a page has its own
 * phone chrome instead of ListPageLayout, it is the last control of the
 * search row. It sits last so the primary "New X" action keeps its place and
 * the toggle does not move as other actions come and go.
 *
 * Wiring: the page header and the list body both call
 * `useListLayout("<list key>", "grid")` with the same key; they share one
 * persisted value. Render the items through `EntityCollection`.
 *
 * It is two icon-only AppButtons in a SegmentedControl (`subtle`, `icon-sm`),
 * the same size as the sources-picker trigger beside it in list headers.
 */
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { IconGridView, IconListView } from "@/lib/icons";
import type { ListLayout } from "@/composables/useListLayout";

const layout = defineModel<ListLayout>({ required: true });

const OPTIONS: ReadonlyArray<SegmentedOption<ListLayout>> = [
  { value: "rows", label: "List view", icon: IconListView },
  { value: "grid", label: "Grid view", icon: IconGridView },
];
</script>
