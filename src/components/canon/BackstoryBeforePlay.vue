<template>
  <section class="flex min-w-0 flex-col gap-1" aria-label="Before play" data-testid="before-play">
    <span class="text-eyebrow text-muted-foreground">Before play</span>
    <template v-if="editable">
      <RichTextEditor v-model="draft.text" size="sm" toolbar="focus" placeholder="Who they were before the campaign began…" />
      <AutosaveStatus :status="status" :error="saveError" />
    </template>
    <RichTextViewer v-else-if="member.player_description" :content="member.player_description" />
    <p v-else class="m-0 text-caption italic text-muted-foreground">They have not written anything yet.</p>
    <p class="m-0 text-caption text-muted-foreground">This is the character's own Backstory field, the one the sheet and the Hall of Heroes carry. It opens the story.</p>
  </section>
</template>

<script setup lang="ts">
/**
 * "Before play" (#1226 story 10, frame 14): the first part of a backstory is the character's own Backstory field
 * (`party_members.player_description`), not a copy of it, so a character that leaves this campaign takes it along. The
 * player and the DM both edit it, saved through the ordinary party member update.
 */
import { reactive, watch } from "vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useAutosave } from "@/composables/useAutosave";
import type { PartyMember } from "@/types/party.types";

const { member, editable } = defineProps<{ member: PartyMember; editable: boolean }>();

interface FieldDraft { text: string | null | undefined }
const draft = reactive<FieldDraft>({ text: member.player_description });
const { mutateAsync: updateMember } = useUpdatePartyMember();
const { status, saveError, dirty, reset } = useAutosave<FieldDraft>({
  draft,
  initial: () => ({ text: member.player_description }),
  equal: (a, b) => a.text === b.text,
  save: (snapshot) => updateMember({ id: member.id, update: { player_description: snapshot.text } }).then(() => undefined),
});
watch(() => member.player_description, (next) => {
  if (!dirty.value && next !== draft.text) reset({ text: next });
});
</script>
