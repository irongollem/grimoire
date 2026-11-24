<template>
  <li :id="`canon-entry-${entry.id}`" class="flex min-w-0 flex-col gap-1 border-b border-border px-3 py-1.5 last:border-b-0" :data-kind="entry.premise_kind">
    <div class="flex min-w-0 items-center gap-2">
      <span
        v-if="note"
        class="shrink-0 border px-1.5 py-px text-label font-bold uppercase"
        :class="entry.premise_kind === 'line' ? 'border-destructive/40 text-destructive' : 'border-border text-muted-foreground'"
      >
        {{ entry.premise_kind === "line" ? "Line" : "Veil" }}
      </span>
      <AppInput
        :key="revision"
        v-model.lazy="text"
        wrap
        size="body"
        :aria-label="label"
        :class="textClass"
      />
      <span v-if="note" class="hidden shrink-0 text-caption text-muted-foreground sm:inline">{{ note }}</span>
      <AudienceRevealControl
        :visible-to="entry.player_visible_to"
        :name="entry.title"
        @change="(next) => update({ id: entry.id, patch: { player_visible_to: next } })"
      />
      <CanonMoveButtons v-if="move" :label="entry.title" :first="move.first" :last="move.last" @move="(d) => emit('move', d)" />
      <AppButton variant="ghost" size="icon-sm" :icon="IconDelete" aria-label="Delete this entry" @click="remove" />
    </div>
    <ThemeCarriedBy v-if="entry.premise_kind === 'theme'" :entry="entry" />
  </li>
</template>

<script setup lang="ts">
/**
 * One line of the premise (a theme, how it plays at the table, a line or a veil). It saves when the field is left;
 * players may be shown it through the reveal control, and a line and a veil read differently by word and by
 * type (an upright line against an italic, faded veil), never by colour alone.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import CanonMoveButtons from "./CanonMoveButtons.vue";
import ThemeCarriedBy from "./ThemeCarriedBy.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import { useTrashCanonEntry, useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { useConfirm } from "@/composables/useConfirm";
import { IconDelete } from "@/lib/icons";
import type { CanonEntry } from "@/types/canon.types";

const { entry, label, move = null } = defineProps<{
  entry: CanonEntry;
  label: string;
  /** Up and down within its kind; `null` hides them. */
  move?: { first: boolean; last: boolean } | null;
}>();
const emit = defineEmits<{ move: [direction: -1 | 1] }>();

const { mutate: update } = useUpdateCanonEntry();
const { mutate: destroy } = useTrashCanonEntry();
const { confirm } = useConfirm();

const { text, revision } = useCommittedText(() => entry.title, (title) => update({ id: entry.id, patch: { title } }));

const note = computed(() => {
  if (entry.premise_kind === "line") return "never in the story";
  if (entry.premise_kind === "veil") return "happens off screen";
  return null;
});

const textClass = computed(() => {
  if (entry.premise_kind === "veil") return "italic text-muted-foreground";
  return "";
});

async function remove() {
  const ok = await confirm(`Delete "${entry.title}"? It goes to Deleted for thirty days, where you can restore it.`, { title: "Delete this entry", confirmLabel: "Delete" });
  if (ok) destroy(entry.id);
}
</script>
