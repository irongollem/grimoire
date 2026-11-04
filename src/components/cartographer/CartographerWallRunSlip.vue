<template>
  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
    <span class="text-caption text-foreground">{{ summary }}</span>
    <AppButton
      variant="destructive"
      size="xs"
      :icon="IconDelete"
      label="Delete"
      tooltip="Del takes away what is picked. On a node alone it joins its two walls into one"
      @click="emit('delete')"
    />
    <span class="basis-full text-caption-sm text-muted-foreground">
      <template v-if="refusal">{{ refusal }}</template>
      <template v-else-if="run.object">Drag to move it a cell at a time. Shift+click adds more, a drag on empty ground draws a box, Esc lets go.</template>
      <template v-else-if="run.items !== undefined">Drag any picked piece to move them all together. Shift+click adds or removes one. Esc lets go.</template>
      <template v-else>Alt+click picks the whole wall, Shift+click adds to the pick, a drag on empty ground draws a box. Drag a node to move it, double-click a wall to add a node, a node to switch it between curve and corner. Alt skips the grid.</template>
    </span>
  </div>
</template>

<script setup lang="ts">
// The slip Select shows over picked walls (#1125 frame 17): "Wall · 4 segments · 1 door", or "3 items" when props and
// lights are picked with them, or what a lone pack object is ("a brazier, from the Stone set"), what Delete does, and in a line why a drag was refused when it was.
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconDelete } from "@/lib/icons";
import type { EditRefusal } from "@/cartographer/wallEdit/edit";

const { run, refusalReason = null } = defineProps<{
  run: { bones: number; nodes: number; doors: number; items?: number; object?: { label: string; rotation: number } };
  /** Why the last move or delete was refused (the controller keeps the last good shape on screen). */
  refusalReason?: EditRefusal | null;
}>();
const emit = defineEmits<{ delete: [] }>();

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;
const summary = computed(() => {
  if (run.object) return run.object.label;
  if (run.items !== undefined) return plural(run.items, "item");
  // Segments when whole segments are picked; bare nodes (a box that caught corners only) are counted as nodes.
  const parts = ["Wall", run.bones > 0 ? plural(run.bones, "segment") : plural(run.nodes, "node")];
  if (run.doors > 0) parts.push(plural(run.doors, "door"));
  return parts.join(" · ");
});

const REFUSALS: Record<EditRefusal, string> = {
  "unknown-node": "That node is gone.",
  "unknown-run": "That wall is gone.",
  collapsed: "That would squash a wall down to a point.",
  overlap: "A wall already lies there.",
  "not-two-bones": "A node joins two walls only where exactly two meet. Delete a wall to take it away.",
  "at-end": "That is the end of the wall already.",
  "off-run": "That is not on the wall.",
  "not-smoothable": "A wall curves through a node only where exactly two plain walls meet. Doors, grid walls, junctions and ends stay corners.",
};
const refusal = computed(() => (refusalReason ? REFUSALS[refusalReason] : null));
</script>
