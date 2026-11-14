<template>
  <!-- The drawer with nothing selected (#1194, frame 11): the quest as a table
       reads it. Where it stands, the line players read, the quest's own notes,
       then its objectives. They scroll with the notes rather than pinning a
       foot: a quest with many objectives squeezed the notes out of view. -->
  <QuestColumnFrame label="The quest">
    <template #header>
      <p class="text-caption text-muted-foreground">{{ standing }}</p>
      <h2 class="text-heading-sm font-bold text-foreground">The quest</h2>
      <label class="flex flex-col gap-0.5">
        <span class="flex items-center gap-2 text-caption text-muted-foreground">
          Players read
          <AutosaveStatus :status="summaryStatus" :error="summaryError" />
        </span>
        <AppInput
          v-model="summaryDraft.summary"
          tone="card"
          size="body-xs"
          aria-label="Players read"
          :maxlength="QUEST_SUMMARY_MAX"
          placeholder="One line the players read about this quest"
        />
      </label>
    </template>

    <section class="flex min-w-0 flex-col gap-2" aria-label="Quest notes">
      <div class="flex items-center gap-2">
        <h3 class="min-w-0 flex-1 text-heading-sm font-bold text-foreground">Notes</h3>
        <AutosaveStatus v-if="editing" :status="notesStatus" :error="notesError" />
        <AppButton v-if="hasNotes && !editing" variant="link" size="inline-caption" label="Edit notes" @click="editing = true" />
        <AppButton v-else-if="editing" variant="link" size="inline-caption" label="Done" @click="finishEditing" />
      </div>
      <RichTextEditor
        v-if="editing"
        v-model="notesDraft.dm_content"
        placeholder="Premise, goals, themes, prep: anything that belongs to no single scene."
        :entity-mention-items="entityMentionItems"
      />
      <RichTextViewer v-else-if="hasNotes" :content="quest.dm_content" />
      <div v-else class="flex flex-col items-start gap-2">
        <p class="text-body italic text-muted-foreground">Premise, goals, themes, prep: anything that belongs to no single scene.</p>
        <AppButton variant="subtle" size="sm" label="Write notes" @click="editing = true" />
      </div>
    </section>

    <QuestObjectivesFoot :quest-id="quest.id" class="border-t border-border pt-3" @select-beat="emit('select-beat', $event)" />
  </QuestColumnFrame>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { useParty } from "@/composables/party/useParty";
import { useQuestBeats } from "@/composables/quests/useQuestFlow";
import { useUpdateQuest } from "@/composables/quests/useQuests";
import { useAutosave } from "@/composables/useAutosave";
import { hasBeatText } from "@/lib/quests/beatText";
import { audienceLabel, questAudienceOf } from "@/lib/quests/visibility";
import { QUEST_SUMMARY_MAX } from "@/lib/quests/summary";
import { QUEST_STATUS_LABELS, type Quest } from "@/types/quest.types";
import QuestColumnFrame from "./QuestColumnFrame.vue";
import QuestObjectivesFoot from "./QuestObjectivesFoot.vue";

const { quest } = defineProps<{ quest: Quest }>();
const emit = defineEmits<{ "select-beat": [beatId: string] }>();

const { mutateAsync: updateQuest } = useUpdateQuest();
const { mentionItems: entityMentionItems } = useEntityMentionItems();

// "Active · Shown to the whole party": the quest's lane, then whether any beat shows. A quest has no
// audience of its own; it is visible when one of its beats is rumored or revealed.
const { data: beats } = useQuestBeats(computed(() => quest.id));
const { data: party } = useParty();
const standing = computed(() => {
  const audience = questAudienceOf(beats.value ?? []);
  const members = (party.value ?? []).map((member) => ({ id: member.id, name: member.name }));
  const who = audience.kind === "hidden" ? "Hidden from players" : audience.kind === "party" ? "Shown to the whole party" : `Shown to ${audienceLabel(audience.memberIds, members)}`;
  return `${QUEST_STATUS_LABELS[quest.status]} · ${who}`;
});

// Each field autosaves on its own and writes only its own column, so typing in
// one can never put the other's stale text back (#946).
const summaryDraft = reactive({ summary: quest.summary || "" });
const notesDraft = reactive({ dm_content: quest.dm_content || "" });
const activeQuestId = ref(quest.id);

const { status: summaryStatus, saveError: summaryError, dirty: summaryDirty, saving: summarySaving, reset: resetSummary } = useAutosave({
  draft: summaryDraft,
  initial: () => ({ summary: quest.summary || "" }),
  equal: (a, b) => a.summary.trim() === b.summary.trim(),
  errorMessage: "Could not save the players' line",
  async save(snapshot) {
    await updateQuest({ id: activeQuestId.value, update: { summary: snapshot.summary.trim() || null } });
  },
});

const { status: notesStatus, saveError: notesError, dirty: notesDirty, saving: notesSaving, saveNow: saveNotes, reset: resetNotes } = useAutosave({
  draft: notesDraft,
  initial: () => ({ dm_content: quest.dm_content || "" }),
  equal: (a, b) => a.dm_content === b.dm_content,
  errorMessage: "Could not save the quest's notes",
  async save(snapshot) {
    await updateQuest({ id: activeQuestId.value, update: { dm_content: hasBeatText(snapshot.dm_content) ? snapshot.dm_content : null } });
  },
});

const editing = ref(false);
const hasNotes = computed(() => hasBeatText(quest.dm_content));
async function finishEditing() {
  await saveNotes();
  editing.value = false;
}

// Our own save echoes straight back through this prop, normalised (blank text
// nulled, the line trimmed). Re-seeding a draft from it would delete characters
// under the caret mid-sentence, so a row only replaces text nobody is typing.
watch(() => quest, (next) => {
  const sameQuest = next.id === activeQuestId.value;
  if (!sameQuest) {
    activeQuestId.value = next.id;
    editing.value = false;
    resetSummary({ summary: next.summary || "" });
    resetNotes({ dm_content: next.dm_content || "" });
    return;
  }
  if (!summaryDirty.value && !summarySaving.value) resetSummary({ summary: next.summary || "" });
  if (!notesDirty.value && !notesSaving.value) resetNotes({ dm_content: next.dm_content || "" });
}, { deep: true });
</script>
