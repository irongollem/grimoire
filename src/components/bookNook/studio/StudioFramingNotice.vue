<template>
  <div v-if="notes.length > 0" class="flex flex-col gap-2">
    <CautionNotice v-for="note in notes" :key="note.key" class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="min-w-0 flex-1">{{ note.text }}</span>
      <AppButton v-if="canGentler" variant="outline" size="xs" label="Breathe gentler" @click="emit('gentler')" />
    </CautionNotice>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CautionNotice from "@/components/common/feedback/CautionNotice.vue";
import { layerName } from "@/lib/bookNook/edit";
import type { Issue, Side } from "@/lib/bookNook/framing";

/**
 * Names what is wrong with the shown screen's window in plain words, under the stage. A dark edge is fixed by
 * breathing gentler. A cut-out whose cut edge shows inside the window looks like it floats; moving the window
 * is the fix for that, and it lives in the side view, so here the only button is the gentler breath.
 */
const { issues, screen, canGentler, names } = defineProps<{
  issues: readonly Issue[];
  /** Each layer's own name, when the DM gave it one. */
  names: ReadonlyMap<string, string>;
  /** What the screen is called in a sentence: "TV", "phone", "Atlas". */
  screen: string;
  canGentler: boolean;
}>();
const emit = defineEmits<{ gentler: [] }>();

/** A name the DM gave is said as given ("Floss's armchair's"); a derived one is a common noun ("The chair back's"). */
function whose(id: string): string {
  const given = names.get(id);
  return given ? `${given}'s` : `The ${layerName(id).toLowerCase()}'s`;
}

const SIDE: Record<Side, string> = { top: "top", right: "right-hand", bottom: "bottom", left: "left-hand" };
const possessive = (s: string) => (s === "phone" ? "The phone's" : `The ${s}'s`);

const notes = computed(() =>
  issues.map((issue) =>
    issue.kind === "dark-edge"
      ? {
          key: "dark-edge",
          text: `${possessive(screen)} window reaches the edge of the picture: at its furthest breath a dark strip shows.`,
        }
      : {
          key: `${issue.layerId}:${issue.side}`,
          text: `${whose(issue.layerId)} cut ${SIDE[issue.side]} edge shows inside the ${screen}'s window, so it seems to float.`,
        },
  ),
);
</script>
