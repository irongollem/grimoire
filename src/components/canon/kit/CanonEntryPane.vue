<template>
  <section class="flex min-w-0 flex-col gap-4" :aria-label="kind" data-testid="canon-entry-pane">
    <!-- A letterhead (a species, a habitat) sets its title in type over a double gilt rule, with a rank line above. -->
    <header class="flex items-start gap-2" :class="letterhead ? 'border-b-[3px] border-double border-primary/60 pb-3' : ''">
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <span v-if="letterhead" class="text-eyebrow text-muted-foreground" data-testid="canon-entry-rank"><slot name="rank">{{ kind }}</slot></span>
        <span v-else class="text-caption italic text-muted-foreground">{{ kind }}</span>
        <slot name="title" />
      </div>
      <AppButton variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="closeLabel" data-testid="canon-entry-close" @click="emit('close')" />
    </header>

    <div v-if="$slots.who" class="flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="canon-entry-who">
      <slot name="who" />
    </div>

    <slot />

    <slot name="connections" />

    <footer v-if="deleteLabel !== undefined" class="flex justify-end border-t border-border pt-3">
      <AppButton variant="destructive" size="sm" :icon="IconDelete" icon-size="xs" :label="deleteLabel" data-testid="canon-entry-delete" @click="emit('delete')" />
    </footer>
  </section>
</template>

<script setup lang="ts">
/**
 * The shell every chapter's open entry reads in, always in the same order: a small kind word with the title field and
 * a close, one line of who (who knows it, which arc), the text and the chapter's own blocks, the connections, and a
 * footer with delete. No card round the whole pane: its text and blocks are the cards. A chapter whose entries are not
 * deleted from here (a backstory) gives no `deleteLabel` and gets no footer.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconClose, IconDelete } from "@/lib/icons";

const { kind, deleteLabel, closeLabel, letterhead = false } = defineProps<{
  /** The small word over the title: "Truth". */
  kind: string;
  deleteLabel?: string;
  closeLabel: string;
  /** Set the head as a field guide's letterhead (#1283): the `rank` slot over the title, a double rule under it. */
  letterhead?: boolean;
}>();
const emit = defineEmits<{ close: []; delete: [] }>();
</script>
