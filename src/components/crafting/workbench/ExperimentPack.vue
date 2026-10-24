<template>
  <section aria-labelledby="experiment-pack-title" class="flex flex-col gap-2">
    <h2 id="experiment-pack-title" class="text-eyebrow text-muted-foreground">Your pack</h2>
    <p v-if="entries.length === 0" class="text-body text-muted-foreground italic">
      {{ emptyText }}
    </p>
    <ul v-else class="flex flex-wrap gap-2">
      <li v-for="e in entries" :key="e.row.id">
        <!-- A raw button: a pack tile is a picture with a name, not a control recipe. -->
        <button
          :ref="(el) => setRef(e.row.id, el)"
          type="button"
          class="flex w-40 items-center gap-2 rounded-lg border border-border bg-card p-2 text-left text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
          :disabled="full"
          :aria-label="`${e.name}, ${e.row.quantity} held. Lay it on the bench.`"
          @click="emit('lay', e.row.id)"
        >
          <WorkbenchThumb :sprite="e.sprite" look="plain" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-label-lg font-semibold">{{ e.name }}</span>
            <span class="block text-caption text-muted-foreground">&times;{{ e.row.quantity }}</span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import WorkbenchThumb from "@/components/crafting/workbench/WorkbenchThumb.vue";
import type { ExperimentEntry } from "@/lib/crafting/experiment";

const { entries, full, emptyText } = defineProps<{
  /** Every eligible row not already on the bench. */
  entries: readonly ExperimentEntry[];
  /** The bench holds as many as it can. */
  full: boolean;
  emptyText: string;
}>();

const emit = defineEmits<{ lay: [rowId: string] }>();

const tiles = new Map<string, HTMLButtonElement>();
function setRef(id: string, el: unknown) {
  if (el instanceof HTMLButtonElement) tiles.set(id, el);
  else tiles.delete(id);
}

defineExpose({ focusFirst: () => entries[0] && tiles.get(entries[0].row.id)?.focus() });
</script>
