<template>
  <div class="flex flex-col gap-2">
    <h2 :class="headingClass">Mentioned in</h2>

    <p v-if="!backlinks?.length" class="text-body text-muted-foreground italic">
      Not mentioned in any notes yet.
    </p>
    <div v-else class="flex flex-wrap gap-2">
      <RouterLink
        v-for="note in backlinks"
        :key="note.id"
        :to="`/notes/${note.id}`"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 transition-colors hover:border-primary/50"
      >
        <IconNote class="h-3 w-3 shrink-0 text-muted-foreground" />
        <span class="max-w-48 truncate font-cinzel text-xs text-foreground">{{ note.title || "Untitled note" }}</span>
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { IconNote } from "@/lib/icons";
import { useEntityBacklinks } from "@/composables/notes/useEntityBacklinks";

/**
 * "Mentioned in" — the campaign's session notes that @mention this entity
 * (epic #932, story 1). Always renders its section heading, with a single
 * muted line for the empty state (matching `EntityCalendarSection`'s "No
 * dates pinned yet.") rather than hiding entirely, so its presence next to
 * sibling detail sections is consistent whether or not any note exists yet.
 */
const {
  entityId,
  headingClass = "font-cinzel text-sm font-bold tracking-wide text-foreground",
} = defineProps<{
  entityId: string;
  /** The heading idiom of the sections it sits among, which differs per surface; the default is the Atlas place pane's. */
  headingClass?: string;
}>();

const { data: backlinks } = useEntityBacklinks(() => entityId);
</script>
