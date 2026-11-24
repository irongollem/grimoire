<template>
  <li
    class="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2"
    :data-found="found"
    data-testid="clue-row"
  >
    <span class="min-w-0">
      <AppInput
        :key="revision"
        v-model.lazy="text"
        wrap
        size="body"
        tone="filled"
        aria-label="The clue"
        placeholder="What the party can find…"
      />
      <span class="mt-1 flex flex-wrap items-center gap-x-2 text-label text-muted-foreground">
        <CanonRef v-if="where && where.name" :kind="where.kind" :name="where.name" />
        <RouterLink
          v-else-if="passage"
          :to="{ path: '/canon', query: { entry: passage.entryId } }"
          class="underline-offset-2 hover:underline"
          data-testid="clue-passage"
        >A lore passage: {{ passage.title || "untitled" }}</RouterLink>
        <span v-else-if="!where" class="italic" data-testid="clue-nowhere">Not placed anywhere yet</span>
        <span v-if="found" data-testid="clue-found-at">Found {{ foundOn }}</span>
      </span>
    </span>
    <span class="flex items-center gap-2 self-end">
      <AppCheckbox :model-value="found" label="Found" label-role="label" @update:model-value="(v: boolean) => emit('found', v)" />
      <AppButton variant="ghost" size="icon-sm" :icon="IconClose" aria-label="Remove this clue" @click="emit('remove')" />
    </span>
  </li>
</template>

<script setup lang="ts">
/** One clue of a secret: its line (saved when the field is left), where it lies or the lore passage it is, and the Found tick. */
import { RouterLink } from "vue-router";
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import CanonRef from "./CanonRef.vue";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { IconClose } from "@/lib/icons";
import type { ClueWhere } from "@/composables/canon/useClueWhere";
import type { CanonClue } from "@/types/canon.types";

const { clue, where, passage = null } = defineProps<{
  clue: CanonClue;
  where: ClueWhere | null;
  /** The lore passage this clue is (`canon_clues.passage_id`): it lies where the passage comes out, not at a place of its own. */
  passage?: { title: string; entryId: string } | null;
}>();
const emit = defineEmits<{ found: [found: boolean]; rename: [title: string]; remove: [] }>();

const found = computed(() => clue.found_at !== null);
const foundOn = computed(() => (clue.found_at ? new Date(clue.found_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""));

const { text, revision } = useCommittedText(() => clue.title, (next) => emit("rename", next));
</script>
