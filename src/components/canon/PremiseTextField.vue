<template>
  <div class="flex flex-col gap-1.5" :data-testid="`premise-${kind}`">
    <label :for="id" class="text-eyebrow text-muted-foreground">{{ label }}</label>
    <!-- A native textarea on purpose: this text is an AI prompt, and rich text would hand the model markup (CLAUDE.md, Sanctioned Exceptions). -->
    <textarea
      :id="id"
      v-model="draft.text"
      rows="3"
      class="w-full resize-y border border-border bg-card p-2 text-body text-foreground placeholder:text-muted-foreground"
      :placeholder="placeholder"
    />
    <div class="flex flex-wrap items-center gap-2">
      <p class="flex-1 text-caption text-muted-foreground">{{ help }}</p>
      <AutosaveStatus :status="status" :error="saveError" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The campaign's voice or its look: what every AI suggestion is written or painted from. Players never read it,
 * so it has no reveal control. It saves itself; the first save creates the entry.
 */
import { reactive, watch } from "vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import { createCanonEntry, updateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useAutosave } from "@/composables/useAutosave";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useQueryClient } from "@tanstack/vue-query";
import type { CanonEntry } from "@/types/canon.types";

const { kind, label, placeholder, help, campaignId, entry } = defineProps<{
  kind: "voice" | "look";
  label: string;
  placeholder: string;
  help: string;
  campaignId: string;
  /** The saved entry, absent until the DM writes something. */
  entry?: CanonEntry;
}>();

const id = `canon-premise-${kind}`;
const qc = useQueryClient();

interface TextDraft { text: string }

const draft = reactive<TextDraft>({ text: entry?.title ?? "" });
// Once the first save has created the row, later saves update it; the entry prop catches up with the next read.
let savedId: string | null = entry?.id ?? null;

const { status, saveError, dirty, reset } = useAutosave<TextDraft>({
  draft,
  initial: () => ({ text: entry?.title ?? "" }),
  equal: (a, b) => a.text === b.text,
  save: async (snapshot) => {
    if (savedId === null) {
      savedId = (await createCanonEntry(campaignId, { part: "premise", premise_kind: kind, title: snapshot.text })).id;
    } else {
      await updateCanonEntry(savedId, { title: snapshot.text });
    }
    await qc.invalidateQueries({ queryKey: [CANON_KEY] });
  },
  // Nothing is written for an empty box that was never saved.
  canSave: () => savedId !== null || draft.text.trim() !== "",
  errorMessage: "Could not save",
});

watch(() => entry, (next) => {
  if (next) savedId = next.id;
  if (!dirty.value && (next?.title ?? "") !== draft.text) reset({ text: next?.title ?? "" });
});
</script>
