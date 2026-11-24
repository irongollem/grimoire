<template>
  <CanonEntryPane kind="People" delete-label="Remove from the peoples" close-label="Close this people" data-testid="people-editor" @close="emit('close')" @delete="emit('remove')">
    <template #title>
      <h3 class="m-0 text-heading-sm font-bold">{{ people.name }}</h3>
    </template>

    <template #who>
      <label class="flex items-center gap-2 text-body">
        Share of the population
        <AppInput v-model.lazy.number="share" type="number" tone="filled" size="body" align="right" :block="false" class="w-20" :aria-label="`Share of ${people.name}, percent`" />
        <span class="text-muted-foreground" aria-hidden="true">%</span>
      </label>
      <p v-if="problem" class="m-0 w-full text-caption text-destructive" role="alert">{{ problem }}</p>
    </template>

    <CanonBlock title="What they are like">
      <div class="flex flex-col gap-1">
        <RichTextEditor v-model="draft.body" size="sm" toolbar="focus" allow-secrets :entity-mention-items="mentionItems" aria-label="What they are like" placeholder="How they live, what they value, what the others make of them…" />
        <AutosaveStatus :status="status" :error="saveError" />
      </div>
      <AppButton v-if="recordPath" class="self-start" variant="link" size="inline" :label="people.kind === 'species' ? 'Open the species' : 'Open the creature'" :to="recordPath" />
    </CanonBlock>
  </CanonEntryPane>
</template>

<script setup lang="ts">
/**
 * The open people, in the chapter's entry pane: its share of the population, what they are like (saves itself) and a
 * line to the species or creature record it is. The name is the record's, so it is not editable here. A share that the
 * database would refuse (a total past 100) is said and not sent, as `ShareList` does for a habitat.
 */
import { computed, reactive, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import CanonBlock from "../kit/CanonBlock.vue";
import CanonEntryPane from "../kit/CanonEntryPane.vue";
import { usePeoplesEditing } from "@/composables/canon/useCampaignPeoples";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { useAutosave } from "@/composables/useAutosave";
import { sharesProblem } from "@/lib/canon/shares";
import type { People } from "@/lib/canon/peoples";

const { people, all } = defineProps<{ people: People; all: readonly People[] }>();
const emit = defineEmits<{ close: []; remove: [] }>();

const { setPercent, saveBody } = usePeoplesEditing();
const { mentionItems } = useEntityMentionItems();

const share = ref<number | null>(people.percent);
watch(() => people.percent, (next) => { share.value = next; });

/** The whole list as the screen holds it: this share as typed (a cleared field is not a number), the others as saved. */
const problem = computed(() =>
  sharesProblem(all.map((p) => ({ name: p.name, percent: p.id === people.id ? (share.value ?? Number.NaN) : p.percent })), "the whole population"),
);
watch(share, (next) => {
  if (problem.value === null && typeof next === "number" && next !== people.percent) setPercent(people.id, next);
});

// A species or creature, by its own id, whether a book's or the DM's.
const recordPath = computed(() => (!people.readable ? null : `/${people.kind === "species" ? "species" : "monsters"}/${people.recordId}`));

interface BodyDraft { body: string | null }
const draft = reactive<BodyDraft>({ body: people.body });
const { status, saveError, dirty, reset } = useAutosave<BodyDraft>({
  draft,
  initial: () => ({ body: people.body }),
  equal: (a, b) => a.body === b.body,
  save: (snapshot) => saveBody(people.id, snapshot.body),
});
watch(() => people.body, (next) => {
  if (!dirty.value && next !== draft.body) reset({ body: next });
});
</script>
