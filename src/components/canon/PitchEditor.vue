<template>
  <div :id="`canon-entry-${entry.id}`" class="flex flex-col gap-2" data-testid="pitch-editor">
    <RichTextEditor
      v-model="draft.body"
      size="sm"
      toolbar="focus"
      :entity-mention-items="mentionItems"
      placeholder="What is this campaign like? Its country, its trouble, its mood…"
    />
    <div class="flex flex-wrap items-center gap-2">
      <AutosaveStatus :status="status" :error="saveError" />
      <span class="flex-1" />
      <AudienceRevealControl
        :visible-to="entry.player_visible_to"
        name="The pitch"
        @change="(next) => update({ id: entry.id, patch: { player_visible_to: next } })"
      />
      <AppButton variant="ghost" size="sm" :icon="IconDelete" icon-size="xs" label="Remove" @click="remove" />
    </div>
  </div>
</template>

<script setup lang="ts">
/** The pitch's rich text. It saves itself; players read it only once the reveal control shares it. */
import { reactive, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import { useTrashCanonEntry, useUpdateCanonEntry, updateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { useAutosave } from "@/composables/useAutosave";
import { useConfirm } from "@/composables/useConfirm";
import { IconDelete } from "@/lib/icons";
import type { CanonEntry } from "@/types/canon.types";

const { entry } = defineProps<{ entry: CanonEntry }>();
// @mentions of the campaign's people, places and factions; the node stores no name, the AI reads it by id (mentionNames.ts).
const { mentionItems } = useEntityMentionItems();

interface PitchDraft { body: string | null }

const draft = reactive<PitchDraft>({ body: entry.body });
const { mutate: update } = useUpdateCanonEntry();
const { mutate: destroy } = useTrashCanonEntry();
const { confirm } = useConfirm();

const { status, saveError, dirty, reset, hold } = useAutosave<PitchDraft>({
  draft,
  initial: () => ({ body: entry.body }),
  equal: (a, b) => a.body === b.body,
  save: (snapshot) => updateCanonEntry(entry.id, { body: snapshot.body }),
});

// A change from elsewhere (another tab, the doorbell) lands unless the DM has typed something not yet saved.
watch(() => entry.body, (next) => {
  if (!dirty.value && next !== draft.body) reset({ body: next });
});

async function remove() {
  const ok = await confirm("Delete the pitch? It goes to Deleted for thirty days, where you can restore it.", { title: "Delete the pitch", confirmLabel: "Delete" });
  if (!ok) return;
  await hold();
  destroy(entry.id);
}
</script>
