<template>
  <!-- The drawer with nothing selected (#1194, frame 11): the quest as a table
       reads it. Where it stands, the line players read, the quest's own notes,
       and its objectives pinned at the foot. -->
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

    <template #foot>
      <QuestObjectivesFoot :quest-id="quest.id" @select-beat="emit('select-beat', $event)" />
    </template>
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
import { useUpdateQuest } from "@/composables/quests/useQuests";
import { useAutosave } from "@/composables/useAutosave";
import { hasBeatText } from "@/lib/quests/beatText";
import { QUEST_SUMMARY_MAX } from "@/lib/quests/summary";
import { QUEST_STATUS_LABELS, type Quest } from "@/types/quest.types";
import QuestColumnFrame from "./QuestColumnFrame.vue";
import QuestObjectivesFoot from "./QuestObjectivesFoot.vue";

const { quest } = defineProps<{ quest: Quest }>();
const emit = defineEmits<{ "select-beat": [beatId: string] }>();

const { mutateAsync: updateQuest } = useUpdateQuest();
const { mentionItems: entityMentionItems } = useEntityMentionItems();
const { data: party } = useParty();

// "Active · Shared with 2 of 4": the quest's lane, then how many of the party can read it.
const standing = computed(() => {
  const members = new Set((party.value ?? []).map((member) => member.id));
  const shared = quest.player_visible_to.filter((id) => members.has(id)).length;
  const who = shared === 0 ? "Not shared yet" : shared === members.size ? "Shared with the whole party" : `Shared with ${shared} of ${members.size}`;
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
