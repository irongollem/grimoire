<template>
  <div class="flex flex-col gap-1" data-testid="canon-entry-notes">
    <span class="text-eyebrow text-muted-foreground">{{ label }}</span>
    <RichTextEditor v-model="draft.body" size="sm" toolbar="focus" allow-secrets :placeholder="placeholder" />
    <AutosaveStatus :status="status" :error="saveError" />
    <p class="m-0 text-caption text-muted-foreground">{{ help }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * The longer text under a truth's, secret's or force's one line (#1255 items 8 and 15): why it matters, how to play it.
 * It is the entry's own `body`, saves itself, and follows the server copy while the DM has typed nothing unsaved.
 */
import { reactive, watch } from "vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import { updateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useAutosave } from "@/composables/useAutosave";
import type { CanonEntry } from "@/types/canon.types";

const { entry } = defineProps<{ entry: CanonEntry; label: string; help: string; placeholder: string }>();

interface NotesDraft { body: string | null }

const draft = reactive<NotesDraft>({ body: entry.body });

const { status, saveError, dirty, reset } = useAutosave<NotesDraft>({
  draft,
  initial: () => ({ body: entry.body }),
  equal: (a, b) => a.body === b.body,
  save: (snapshot) => updateCanonEntry(entry.id, { body: snapshot.body }),
});

watch(() => entry.body, (next) => {
  if (!dirty.value && next !== draft.body) reset({ body: next });
});
</script>
