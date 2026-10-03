<template>
  <section class="space-y-4" aria-label="Beat editor fields">
    <label class="block space-y-1 text-caption font-semibold text-foreground">
      Title
      <AppInput
        v-model="draft.title"
        placeholder="What happens in this beat?"
        :aria-invalid="!!titleError"
        :aria-describedby="titleError ? 'quest-beat-title-error' : undefined"
      />
      <span v-if="titleError" id="quest-beat-title-error" role="alert" class="block text-caption font-normal text-destructive">{{ titleError }}</span>
    </label>

    <AppCheckbox
      v-if="beat.is_improvised"
      v-model="draft.improv_reviewed"
      label-role="caption"
      label="Post-session review complete"
      class="rounded-md border border-tone-caution/40 bg-tone-caution/5 p-2"
    />

    <label class="block space-y-1 text-caption font-semibold text-foreground">
      DM lead
      <RichTextEditor v-model="draft.dm_content" placeholder="What should the DM know first?" :entity-mention-items="entityMentionItems" />
    </label>

    <label class="block space-y-1 text-caption font-semibold text-foreground">
      Read aloud or paraphrase
      <RichTextEditor v-model="draft.read_aloud" size="md" placeholder="Player-safe boxed text…" :entity-mention-items="entityMentionItems" />
    </label>
    <label class="block space-y-1 text-caption font-semibold text-foreground">
      How it plays
      <RichTextEditor v-model="draft.how_it_plays" size="md" placeholder="Checks, pacing, social pressure, exploration, or combat guidance…" :entity-mention-items="entityMentionItems" />
    </label>

    <div class="grid gap-3 md:grid-cols-2">
      <label class="space-y-1 text-caption font-semibold text-foreground">
        Rumor copy
        <MentionTextarea v-model="draft.rumor_text" :rows="3" placeholder="Exactly what players may see while rumored…" />
      </label>
      <label class="space-y-1 text-caption font-semibold text-foreground">
        Reveal copy
        <MentionTextarea v-model="draft.reveal_text" :rows="3" placeholder="Exactly what players may see once revealed…" />
      </label>
    </div>

    <AutosaveStatus :status="status" :error="saveError" paused-label="Autosave paused until the beat has a title">
      <template #error-action>
        <AppButton label="Reload saved beat" size="xs" variant="subtle" @click="reloadSavedBeat" />
      </template>
    </AutosaveStatus>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useUpdateQuestBeat } from "@/composables/quests/useQuestFlow";
import { useAutosave } from "@/composables/useAutosave";
import { questBeatDraftsEqual, questBeatDraftToUpdate, questBeatToDraft } from "@/lib/quests/beatDraft";
import type { QuestBeat } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import AutosaveStatus from "@/components/common/AutosaveStatus.vue";
import MentionTextarea from "@/components/common/MentionTextarea.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";

const { beat } = defineProps<{ beat: QuestBeat }>();
const emit = defineEmits<{ saved: [beat: QuestBeat] }>();
const updateBeat = useUpdateQuestBeat();
// QuestBeatDetailView is DM-only (the player equivalent, PlayerQuestDetailView
// at /play/quests/:id, is read-only and doesn't mount this component), so the
// full mention list is always the DM's — see NoteEditor.vue for the same call.
const { mentionItems: entityMentionItems } = useEntityMentionItems();
const draft = reactive(questBeatToDraft(beat));
const activeBeatId = ref(beat.id);
const version = ref(beat.updated_at);

const { status, dirty, saving, saveError, reset } = useAutosave({
  draft,
  initial: () => questBeatToDraft(beat),
  equal: questBeatDraftsEqual,
  canSave: () => !!draft.title.trim(),
  errorMessage: "Could not save this beat",
  async save(snapshot) {
    const saved = await updateBeat.mutateAsync({
      id: beat.id,
      questId: beat.quest_id,
      update: questBeatDraftToUpdate(snapshot, beat.improv_reviewed_at),
      expectedUpdatedAt: version.value,
    });
    version.value = saved.updated_at;
    emit("saved", saved);
  },
});
const titleError = computed(() => dirty.value && !draft.title.trim() ? "Give this beat a title before it is saved." : "");

// Our own autosave echoes straight back through this prop — first the optimistic
// write, then the refetch `onSettled` triggers — and the row it carries is the
// *normalised* one: title trimmed, blank prose nulled. Re-seeding the draft
// from that deletes characters out from under the caret mid-sentence, so only
// a genuinely newer row from elsewhere may replace live text.
watch(() => beat, (nextBeat) => {
  const isEcho = nextBeat.updated_at === version.value;
  if (nextBeat.id === activeBeatId.value && (dirty.value || saving.value || isEcho)) return;
  activeBeatId.value = nextBeat.id;
  version.value = nextBeat.updated_at;
  reset(questBeatToDraft(nextBeat));
}, { deep: true });

function reloadSavedBeat() {
  version.value = beat.updated_at;
  reset();
}
</script>
