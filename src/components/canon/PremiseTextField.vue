<template>
  <div :id="entry ? `canon-entry-${entry.id}` : undefined" class="flex flex-col gap-1.5" :data-testid="`premise-${kind}`">
    <label :for="id" class="text-body font-bold">{{ label }}</label>
    <!-- A native textarea on purpose: this text is an AI prompt, and rich text would hand the model markup (CLAUDE.md, Sanctioned Exceptions). -->
    <textarea
      :id="id"
      v-model="draft.text"
      rows="3"
      class="w-full resize-y border border-border bg-card p-2 text-body text-foreground placeholder:text-muted-foreground"
      :placeholder="placeholder"
    />
    <slot />
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
// One creation at a time: a picture added while the first words are being saved must not make a second entry.
let creating: Promise<string> | null = null;

/** The entry's id, creating the entry (with what is typed now) when none exists yet. */
function ensureEntry(): Promise<string> {
  if (savedId !== null) return Promise.resolve(savedId);
  creating ??= createCanonEntry(campaignId, { part: "premise", premise_kind: kind, title: draft.text })
    .then(async (created) => {
      savedId = created.id;
      await qc.invalidateQueries({ queryKey: [CANON_KEY] });
      return created.id;
    })
    .finally(() => { creating = null; });
  return creating;
}

const { status, saveError, dirty, reset } = useAutosave<TextDraft>({
  draft,
  initial: () => ({ text: entry?.title ?? "" }),
  equal: (a, b) => a.text === b.text,
  save: async (snapshot) => {
    // The save that makes the entry has already written the typed words; any other save writes its own.
    const makesIt = savedId === null && creating === null;
    const id = await ensureEntry();
    if (!makesIt || draft.text !== snapshot.text) await updateCanonEntry(id, { title: snapshot.text });
    await qc.invalidateQueries({ queryKey: [CANON_KEY] });
  },
  // Nothing is written for an empty box that was never saved.
  canSave: () => savedId !== null || draft.text.trim() !== "",
  errorMessage: "Could not save",
});

/** The words, from outside (the AI's description of the pictures): set in the box, then saved like typing. */
function setText(text: string) {
  draft.text = text;
}
defineExpose({ ensureEntry, setText, text: () => draft.text });

watch(() => entry, (next) => {
  if (next) savedId = next.id;
  if (!dirty.value && (next?.title ?? "") !== draft.text) reset({ text: next?.title ?? "" });
});
</script>
