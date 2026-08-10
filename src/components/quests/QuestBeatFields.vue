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
        <AppInput v-model="draft.kind" placeholder="social, combat, discovery…" />
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
      <RichTextEditor v-model="draft.dm_content" :min-height="compact ? '7rem' : '11rem'" :sticky-toolbar="!compact" placeholder="What should the DM know first?" />
    </label>

    <template v-if="!compact">
      <label class="block space-y-1 text-caption font-semibold text-foreground">
        Read aloud or paraphrase
        <RichTextEditor v-model="draft.read_aloud" min-height="9rem" placeholder="Player-safe boxed text…" />
      </label>
      <label class="block space-y-1 text-caption font-semibold text-foreground">
        How it plays
        <RichTextEditor v-model="draft.how_it_plays" min-height="11rem" placeholder="Checks, pacing, social pressure, exploration, or combat guidance…" />
      </label>
      <label class="block space-y-1 text-caption font-semibold text-foreground">
        Outcomes
        <RichTextEditor v-model="draft.outcomes" min-height="9rem" placeholder="Likely immediate outcomes and branches…" />
      </label>
      <label class="block space-y-1 text-caption font-semibold text-foreground">
        Consequences
        <RichTextEditor v-model="draft.consequences" min-height="9rem" placeholder="What changes later in the world or other quests?" />
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
import type { QuestBeat } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import MentionTextarea from "@/components/common/MentionTextarea.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";

const props = withDefaults(defineProps<{ beat: QuestBeat; compact?: boolean }>(), { compact: false });
const emit = defineEmits<{
  saved: [beat: QuestBeat];
  preview: [context: { draftVisibility: QuestBeat["visibility"]; savedVisibility: QuestBeat["visibility"]; unsaved: boolean }];
}>();
const updateBeat = useUpdateQuestBeat();
const draft = reactive(questBeatToDraft(props.beat));
let baseline = questBeatToDraft(props.beat);
const activeBeatId = ref(props.beat.id);
const version = ref(props.beat.updated_at);
const dirty = ref(false);
const saving = ref(false);
const saveError = ref("");
const titleError = computed(() => dirty.value && !draft.title.trim() ? "Give this beat a title before it is saved." : "");
let hydrating = false;

watch(() => props.beat, (beat) => {
  if (beat.id === activeBeatId.value && dirty.value) return;
  hydrating = true;
  activeBeatId.value = beat.id;
  baseline = questBeatToDraft(beat);
  Object.assign(draft, baseline);
  version.value = beat.updated_at;
  hydrating = false;
}, { deep: true });

const saveLater = useDebounceFn(() => void saveNow(), 800, { maxWait: 2500 });
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
      id: props.beat.id,
      questId: props.beat.quest_id,
      update: questBeatDraftToUpdate(snapshot),
      expectedUpdatedAt: version.value,
    });
    version.value = saved.updated_at;
    baseline = questBeatToDraft(saved);
    if (questBeatDraftsEqual(draft, snapshot)) {
      hydrating = true;
      Object.assign(draft, baseline);
      dirty.value = false;
      hydrating = false;
    }
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
  baseline = questBeatToDraft(props.beat);
  Object.assign(draft, baseline);
  version.value = props.beat.updated_at;
  dirty.value = false;
  saveError.value = "";
  hydrating = false;
}

onBeforeUnmount(() => {
  void saveNow();
});
</script>
