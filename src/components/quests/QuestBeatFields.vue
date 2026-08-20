<template>
  <section class="space-y-4" :aria-label="compact ? 'Beat inspector fields' : 'Full beat editor fields'">
    <div class="grid gap-3" :class="compact ? '' : 'md:grid-cols-2'">
      <label class="space-y-1 text-caption font-semibold text-foreground">
        Title
        <AppInput
          v-model="draft.title"
          placeholder="What happens in this beat?"
          :aria-invalid="!!titleError"
          :aria-describedby="titleError ? 'quest-beat-title-error' : undefined"
        />
        <span v-if="titleError" id="quest-beat-title-error" role="alert" class="block text-caption font-normal text-destructive">{{ titleError }}</span>
      </label>
      <label class="space-y-1 text-caption font-semibold text-foreground">
        Kind
        <AppSelect v-model="kind">
          <option v-for="option in kindOptions" :key="option" :value="option">{{ kindLabel(option) }}</option>
        </AppSelect>
      </label>
      <label class="space-y-1 text-caption font-semibold text-foreground">
        Presentation
        <AppInput v-model="draft.presentation_hint" placeholder="Tense negotiation, montage…" />
      </label>
      <label class="space-y-1 text-caption font-semibold text-foreground">
        Player visibility
        <AppSelect v-model="draft.visibility">
          <option value="hidden">Hidden</option>
          <option value="rumored">Rumored</option>
          <option value="revealed">Revealed</option>
        </AppSelect>
      </label>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <AppButton label="Preview as players" size="sm" variant="subtle" @click="emit('preview', { draftVisibility: draft.visibility, savedVisibility: beat.visibility, unsaved: dirty })" />
      <span class="text-caption text-muted-foreground">Uses saved player data; DM fields never enter the preview.</span>
    </div>

    <label v-if="beat.is_improvised" class="flex items-center gap-2 rounded-md border border-tone-caution/40 bg-tone-caution/5 p-2 text-caption text-foreground">
      <input v-model="draft.improv_reviewed" type="checkbox" /> Post-session review complete
    </label>

    <label class="block space-y-1 text-caption font-semibold text-foreground">
      DM lead
      <RichTextEditor v-model="draft.dm_content" :size="compact ? 'md' : 'lg'" :sticky-toolbar="!compact" placeholder="What should the DM know first?" />
    </label>

    <template v-if="!compact">
      <label class="block space-y-1 text-caption font-semibold text-foreground">
        Read aloud or paraphrase
        <RichTextEditor v-model="draft.read_aloud" size="md" placeholder="Player-safe boxed text…" />
      </label>
      <label class="block space-y-1 text-caption font-semibold text-foreground">
        How it plays
        <RichTextEditor v-model="draft.how_it_plays" size="lg" placeholder="Checks, pacing, social pressure, exploration, or combat guidance…" />
      </label>
      <label class="block space-y-1 text-caption font-semibold text-foreground">
        Outcomes
        <RichTextEditor v-model="draft.outcomes" size="md" placeholder="Likely immediate outcomes and branches…" />
      </label>
      <label class="block space-y-1 text-caption font-semibold text-foreground">
        Consequences
        <RichTextEditor v-model="draft.consequences" size="md" placeholder="What changes later in the world or other quests?" />
      </label>
    </template>

    <div class="grid gap-3" :class="compact ? '' : 'md:grid-cols-2'">
      <label class="space-y-1 text-caption font-semibold text-foreground">
        Rumor copy
        <MentionTextarea v-model="draft.rumor_text" :rows="3" placeholder="Exactly what players may see while rumored…" />
      </label>
      <label class="space-y-1 text-caption font-semibold text-foreground">
        Reveal copy
        <MentionTextarea v-model="draft.reveal_text" :rows="3" placeholder="Exactly what players may see once revealed…" />
      </label>
    </div>

    <div class="flex min-h-6 items-center gap-2 text-caption" aria-live="polite">
      <span v-if="titleError" class="text-muted-foreground">Autosave paused until the beat has a title</span>
      <span v-else-if="saveError" role="alert" class="text-destructive">{{ saveError }}</span>
      <span v-else-if="saving" class="text-muted-foreground">Saving…</span>
      <span v-else-if="dirty" class="text-muted-foreground">Unsaved changes</span>
      <span v-else class="text-tone-success">Saved</span>
      <AppButton v-if="saveError" label="Reload saved beat" size="xs" variant="subtle" class="ml-auto" @click="reloadSavedBeat" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { useUpdateQuestBeat } from "@/composables/useQuestFlow";
import { questBeatDraftsEqual, questBeatDraftToUpdate, questBeatToDraft } from "@/lib/quests/beatDraft";
import { QUEST_BEAT_KINDS, QUEST_BEAT_KIND_LABELS, type QuestBeat } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import MentionTextarea from "@/components/common/MentionTextarea.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";

const { beat, compact = false } = defineProps<{ beat: QuestBeat; compact?: boolean }>();
const emit = defineEmits<{
  saved: [beat: QuestBeat];
  preview: [context: { draftVisibility: QuestBeat["visibility"]; savedVisibility: QuestBeat["visibility"]; unsaved: boolean }];
}>();
const updateBeat = useUpdateQuestBeat();
const draft = reactive(questBeatToDraft(beat));
let baseline = questBeatToDraft(beat);
const activeBeatId = ref(beat.id);
const version = ref(beat.updated_at);
const dirty = ref(false);
const saving = ref(false);
const saveError = ref("");
const titleError = computed(() => dirty.value && !draft.title.trim() ? "Give this beat a title before it is saved." : "");
// The composer offers these five, so this offered free text and the two drifted.
// A kind the list does not know is kept as an option rather than dropped: a
// generated or imported beat may carry its own word for the scene, and the save
// path already treats blank as "neutral", so blank shows as neutral here too.
const kind = computed({
  get: () => draft.kind || "neutral",
  set: (value: string) => { draft.kind = value; },
});
const kindOptions = computed<string[]>(() => (QUEST_BEAT_KINDS as readonly string[]).includes(kind.value)
  ? [...QUEST_BEAT_KINDS]
  : [...QUEST_BEAT_KINDS, kind.value]);
function kindLabel(option: string) {
  return QUEST_BEAT_KIND_LABELS[option as (typeof QUEST_BEAT_KINDS)[number]] ?? option;
}
let hydrating = false;

// Our own autosave echoes straight back through this prop — first the optimistic
// write, then the refetch `onSettled` triggers — and the row it carries is the
// *normalised* one: title trimmed, blank `kind` defaulted, blank prose nulled.
// Re-seeding the draft from that deletes characters out from under the caret
// mid-sentence, so only a genuinely newer row from elsewhere may replace live text.
watch(() => beat, (nextBeat) => {
  const isEcho = nextBeat.updated_at === version.value;
  if (nextBeat.id === activeBeatId.value && (dirty.value || saving.value || isEcho)) return;
  hydrating = true;
  activeBeatId.value = nextBeat.id;
  baseline = questBeatToDraft(nextBeat);
  Object.assign(draft, baseline);
  version.value = nextBeat.updated_at;
  hydrating = false;
}, { deep: true });

// These are prose boxes, not a search field: 800ms fired inside the pauses of an
// ordinary sentence, and the 2.5s ceiling meant a write plus a full beat-list
// refetch every 2.5s of continuous typing. Long enough now to sit out a
// think-pause, with a ceiling that still bounds what an unexpected close costs.
const saveLater = useDebounceFn(() => void saveNow(), 2000, { maxWait: 10_000 });
watch(draft, () => {
  if (hydrating) return;
  dirty.value = !questBeatDraftsEqual(draft, baseline);
  if (dirty.value) void saveLater();
}, { deep: true });

async function saveNow() {
  if (saving.value || !dirty.value) return;
  if (titleError.value) return;
  saving.value = true;
  saveError.value = "";
  const snapshot = { ...draft };
  try {
    const saved = await updateBeat.mutateAsync({
      id: beat.id,
      questId: beat.quest_id,
      update: questBeatDraftToUpdate(snapshot, beat.improv_reviewed_at),
      expectedUpdatedAt: version.value,
    });
    version.value = saved.updated_at;
    // Baseline is what we *sent*, never the row that came back. `questBeatDraftToUpdate`
    // trims and defaults on the way out, so adopting the saved row here would pull
    // those edits into the live draft — that is what yanked the trailing space off
    // the word being typed every time an autosave landed mid-sentence.
    baseline = { ...snapshot };
    if (questBeatDraftsEqual(draft, snapshot)) dirty.value = false;
    emit("saved", saved);
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "Could not save this beat";
  } finally {
    saving.value = false;
    if (dirty.value && !saveError.value) void saveLater();
  }
}

function reloadSavedBeat() {
  hydrating = true;
  baseline = questBeatToDraft(beat);
  Object.assign(draft, baseline);
  version.value = beat.updated_at;
  dirty.value = false;
  saveError.value = "";
  hydrating = false;
}

// A longer debounce needs a backstop the unmount hook cannot give: closing the tab
// or backgrounding the app never unmounts, and `visibilitychange` is the last event
// that still reliably gets to start a request.
function flushOnHide() {
  if (document.visibilityState === "hidden") void saveNow();
}
document.addEventListener("visibilitychange", flushOnHide);

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", flushOnHide);
  void saveNow();
});
</script>
