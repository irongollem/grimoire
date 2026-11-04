<template>
  <div class="space-y-3">
    <div class="space-y-1">
      <label class="text-label-lg text-muted-foreground" :for="nameId">Lane name</label>
      <AppInput :id="nameId" v-model="draft.name" tone="card" />
      <p v-if="!nameValid" class="text-caption text-destructive">Give the lane a name of 1 to {{ LANE_NAME_MAX }} characters.</p>
    </div>

    <div class="space-y-1">
      <p class="text-label-lg text-muted-foreground">Pads in this lane</p>
      <SegmentedControl v-model="draft.rule" :options="RULES" block />
      <p class="text-caption text-muted-foreground">{{ RULE_HINT[draft.rule] }}</p>
    </div>

    <div class="space-y-1">
      <label class="text-label-lg text-muted-foreground" :for="feedId">Plays here by itself</label>
      <AppSelect :id="feedId" v-model="draft.feed" block>
        <option v-for="option in FEEDS" :key="option.label" :value="option.value">{{ option.label }}</option>
      </AppSelect>
      <p class="text-caption text-muted-foreground">
        Shows what the campaign starts on its own here, so you can stop it. Picking one moves it from the lane that had it.
      </p>
    </div>

    <div class="flex items-center justify-between gap-2">
      <AutosaveStatus :status="autosave.status.value" :error="autosave.saveError.value" paused-label="Not saved yet" />
      <AppButton variant="tinted" tone="primary" size="sm" label="Done" @click="done" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, useId, watch } from "vue";
import { useSoundboardPages, useUpdatePageLane } from "@/composables/soundboard/useSoundboardPages";
import { useAutosave } from "@/composables/useAutosave";
import type { DeckFeed, DeckLane } from "@/types/sound.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";

const { pageId, laneIndex } = defineProps<{ pageId: string; laneIndex: number }>();
const emit = defineEmits<{ close: [] }>();

// Mirrors the database CHECK (isValidLanes).
const LANE_NAME_MAX = 40;
const RULES: { value: DeckLane["rule"]; label: string }[] = [
  { value: "one", label: "One at a time" },
  { value: "together", label: "Together" },
];
const RULE_HINT: Record<DeckLane["rule"], string> = {
  one: "A new pad fades out the one before it.",
  together: "Pads play over each other.",
};

const FEEDS: { value: DeckFeed | null; label: string }[] = [
  { value: null, label: "Nothing" },
  { value: "music", label: "Music from fights and quests" },
  { value: "place", label: "Where the party is" },
  { value: "ambience", label: "Quest ambience" },
];

const feedId = `${useId()}-lane-feed`;
const nameId = `${useId()}-lane-name`;
const { data: pages } = useSoundboardPages();
const { mutateAsync: updateLane } = useUpdatePageLane();

const lane = computed(() => (pages.value ?? []).find((p) => p.id === pageId)?.lanes[laneIndex] ?? null);

const draft = reactive<DeckLane>({ name: "", rule: "one", feed: null });
const nameValid = computed(() => {
  const length = draft.name.trim().length;
  return length >= 1 && length <= LANE_NAME_MAX;
});

let hydrated: { pageId: string; laneIndex: number } | null = null;

const autosave = useAutosave<DeckLane>({
  draft,
  initial: () => (lane.value ? { ...lane.value, feed: lane.value.feed ?? null } : { ...draft }),
  equal: (a, b) => a.name === b.name && a.rule === b.rule && a.feed === b.feed,
  canSave: () => nameValid.value,
  delay: 500,
  save: async (snapshot) => {
    // The lane the draft was hydrated from, even if the props have moved on.
    if (hydrated === null) return;
    await updateLane({ ...hydrated, patch: { name: snapshot.name.trim(), rule: snapshot.rule, feed: snapshot.feed } });
  },
});

// Hydrate when the lane first loads or another lane is picked, never on a refresh mid-typing.
watch(
  () => (lane.value ? `${pageId}:${laneIndex}` : null),
  async (key) => {
    if (key === null) return;
    if (hydrated !== null && `${hydrated.pageId}:${hydrated.laneIndex}` === key) return;
    if (hydrated !== null) await autosave.saveNow();
    hydrated = { pageId, laneIndex };
    autosave.reset();
  },
  { immediate: true },
);

async function done() {
  await autosave.saveNow();
  emit("close");
}
</script>
