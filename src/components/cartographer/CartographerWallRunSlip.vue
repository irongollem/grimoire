<template>
  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
    <span class="text-caption text-foreground">{{ summary }}</span>
    <AppButton
      variant="destructive"
      size="xs"
      :icon="IconDelete"
      label="Delete"
      tooltip="Del on a node joins its two walls into one; on a wall it takes that wall away"
      @click="emit('delete')"
    />
    <span class="basis-full text-caption-sm text-muted-foreground">
      <template v-if="refusal">{{ refusal }}</template>
      <template v-else>Drag a node to move it. Double-click a wall to add one. Shift slides a wall or holds 45°, Alt skips the grid.</template>
    </span>
  </div>
</template>

<script setup lang="ts">
// The slip Select shows over a picked wall run (#1125 frame 17): "Wall run · 4 bones · 4 nodes · 1 door", what Delete
// does, and in a line why a drag was refused when it was.
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconDelete } from "@/lib/icons";
import type { EditRefusal } from "@/cartographer/wallEdit/edit";

const { run, refusalReason = null } = defineProps<{
  run: { bones: number; nodes: number; doors: number };
  /** Why the last move or delete was refused (the controller keeps the last good shape on screen). */
  refusalReason?: EditRefusal | null;
}>();
const emit = defineEmits<{ delete: [] }>();

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;
const summary = computed(() => {
  const parts = ["Wall run", plural(run.bones, "bone"), plural(run.nodes, "node")];
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
};
const refusal = computed(() => (refusalReason ? REFUSALS[refusalReason] : null));
</script>
