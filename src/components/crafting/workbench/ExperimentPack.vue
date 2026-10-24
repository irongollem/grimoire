<template>
  <section aria-labelledby="experiment-pack-title" class="flex flex-col gap-2">
    <h2 id="experiment-pack-title" class="text-eyebrow text-muted-foreground">Your pack</h2>
    <p v-if="entries.length === 0" class="text-body text-muted-foreground italic">
      {{ emptyText }}
    </p>
    <ul v-else class="flex flex-wrap gap-2">
      <li v-for="e in entries" :key="e.row.id">
        <AppButton
          :ref="(el) => setRef(e.row.id, el)"
          variant="outline"
          surface="card"
          size="body"
          class="w-40 justify-start p-2 text-left font-normal"
          :disabled="full"
          :aria-label="`${e.name}, ${e.left} to lay out. Lay one on the bench.`"
          @click="emit('lay', e.row.id)"
        >
          <WorkbenchThumb :sprite="e.sprite" look="plain" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-label-lg font-semibold">{{ e.name }}</span>
            <span class="block text-caption text-muted-foreground">&times;{{ e.left }}</span>
          </span>
        </AppButton>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import WorkbenchThumb from "@/components/crafting/workbench/WorkbenchThumb.vue";
import type { ExperimentPackEntry } from "@/lib/crafting/experiment";

const { entries, full, emptyText } = defineProps<{
  /** Every eligible row with units not yet in a dish. */
  entries: readonly ExperimentPackEntry[];
  /** The bench holds as many as it can. */
  full: boolean;
  emptyText: string;
}>();

const emit = defineEmits<{ lay: [rowId: string] }>();

// AppButton's ref is its component instance; the real <button> is its `$el`.
const tiles = new Map<string, HTMLElement>();
function setRef(id: string, el: unknown) {
  const node = el && typeof el === "object" && "$el" in el ? (el as { $el: unknown }).$el : null;
  if (node instanceof HTMLElement) tiles.set(id, node);
  else tiles.delete(id);
}

defineExpose({ focusFirst: () => entries[0] && tiles.get(entries[0].row.id)?.focus() });
</script>
