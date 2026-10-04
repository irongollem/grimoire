<template>
  <section class="space-y-3 rounded-lg border border-border bg-card p-3" aria-label="Quest-wide fields">
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <h3 class="text-heading-sm font-bold text-foreground">Quest identity</h3>
        <p class="text-caption text-muted-foreground">What the quest is, rather than what happens in it. The story itself lives in its beats.</p>
      </div>
      <AutosaveStatus :status="status" :error="saveError" />
    </div>
    <DraftConflictNotice :fields="conflictLabels" :on-discard="resetDraft" />

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label class="flex flex-col gap-1 sm:col-span-2">
        <span class="text-label font-semibold text-muted-foreground">Title</span>
        <AppInput
          v-model="draft.title"
          tone="card"
          size="body"
          placeholder="Untitled Quest"
        />
      </label>

      <label class="flex flex-col gap-1 sm:col-span-2">
        <span class="text-label font-semibold text-muted-foreground">Premise</span>
        <AppInput
          v-model="draft.summary"
          tone="card"
          size="body"
          :maxlength="QUEST_SUMMARY_MAX"
          placeholder="Players see this verbatim: the blurb that tells you what the quest is without opening it. One sentence, no DM secrets."
        />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-label font-semibold text-muted-foreground">Board lane</span>
        <AppSelect v-model="draft.status">
          <option v-for="value in QUEST_STATUSES" :key="value" :value="value">{{ QUEST_STATUS_LABELS[value] }}</option>
        </AppSelect>
      </label>

      <div class="flex flex-col gap-1">
        <span class="text-label font-semibold text-muted-foreground">Player sharing</span>
        <div class="flex min-h-9 items-center gap-2">
          <AudienceRevealControl
            :name="quest.title"
            :visible-to="draft.playerVisibleTo"
            @change="onRevealChange"
          />
        </div>
      </div>

      <label class="flex flex-col gap-1">
        <span class="text-label font-semibold text-muted-foreground">Quest giver</span>
        <EntityCombobox v-model="draft.giverNpcId" :options="npcs ?? []" placeholder="Search NPCs…" />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-label font-semibold text-muted-foreground">Primary location</span>
        <EntityCombobox v-model="draft.locationId" :options="locations ?? []" placeholder="Search locations…" />
      </label>

      <label class="flex flex-col gap-1 sm:col-span-2">
        <span class="text-label font-semibold text-muted-foreground">Part of quest</span>
        <EntityCombobox v-model="draft.parentQuestId" :options="parentQuestOptions" placeholder="Search quests…" />
      </label>

      <label class="flex flex-col gap-1 sm:col-span-2">
        <span class="text-label font-semibold text-muted-foreground">Opens at</span>
        <AppInput v-if="!beatOptions.length" model-value="" tone="card" size="body" placeholder="No beats yet" disabled />
        <EntityCombobox v-else v-model="draft.entryBeatId" :options="beatOptions" placeholder="Choose the opening beat…" @update:model-value="onEntryBeatChange" />
        <span class="text-caption text-muted-foreground">Where the story begins. The run starts here unless you choose otherwise.</span>
      </label>

      <div class="flex flex-col gap-1 sm:col-span-2">
        <span class="text-label font-semibold text-muted-foreground">Tags</span>
        <TagInput v-model="draft.tags" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AutosaveStatus from "@/components/common/AutosaveStatus.vue";
import DraftConflictNotice from "@/components/common/DraftConflictNotice.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
import TagInput from "@/components/common/TagInput.vue";
import { sendCampaignAnnouncement } from "@/composables/campaign/useCampaignBroadcast";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useQuestBeats } from "@/composables/quests/useQuestFlow";
import { useAllQuests, useUpdateQuest } from "@/composables/quests/useQuests";
import { useAutosave } from "@/composables/useAutosave";
import { draftValueEqual, useRecordDraft } from "@/composables/useRecordDraft";
import { useCampaignStore } from "@/stores/campaign";
import { QUEST_SUMMARY_MAX } from "@/lib/quests/summary";
import { QUEST_STATUSES, QUEST_STATUS_LABELS, type Quest, type QuestStatus } from "@/types/quest.types";

interface MetadataDraft {
  title: string;
  summary: string;
  status: QuestStatus;
  giverNpcId: string;
  locationId: string;
  parentQuestId: string;
  entryBeatId: string;
  tags: string[];
  playerVisibleTo: string[];
}

const props = defineProps<{ quest: Quest }>();
const campaign = useCampaignStore();
const { data: npcs } = useNpcs();
const { data: locations } = useAllLocations();
const { data: allQuests } = useAllQuests();
const { data: beats } = useQuestBeats(computed(() => props.quest.id));
const { mutateAsync: updateQuest } = useUpdateQuest();

function questToDraft(quest: Quest): MetadataDraft {
  return {
    title: quest.title,
    summary: quest.summary ?? "",
    status: quest.status,
    giverNpcId: quest.giver_npc_id ?? "",
    locationId: quest.location_id ?? "",
    parentQuestId: quest.parent_quest_id ?? "",
    entryBeatId: quest.entry_beat_id ?? "",
    tags: [...quest.tags],
    playerVisibleTo: [...quest.player_visible_to],
  };
}

// What the draft is seeded from. It follows `props.quest`, except across a
// switch to another quest, where it waits for the old quest's pending edits to
// be flushed first: useRecordDraft re-seeds the moment its source changes id,
// which would otherwise throw those edits away.
const shown = ref(props.quest);

const { draft, changes, commit, reset: resetDraft, conflicts } = useRecordDraft({
  source: () => shown.value,
  identity: (quest: Quest) => quest.id,
  toDraft: (quest: Quest | null) => questToDraft(quest ?? shown.value),
});

const CONFLICT_LABELS: Record<keyof MetadataDraft, string> = {
  title: "Title",
  summary: "Premise",
  status: "Board lane",
  giverNpcId: "Quest giver",
  locationId: "Primary location",
  parentQuestId: "Part of quest",
  entryBeatId: "Opens at",
  tags: "Tags",
  playerVisibleTo: "Player sharing",
};
const conflictLabels = computed(() => conflicts.value.map((key) => CONFLICT_LABELS[key]));

/** Pure function of the draft, so a column the DM never touched is left out of the write. */
function metadataRow(d: MetadataDraft) {
  return {
    title: d.title.trim() || "Untitled Quest",
    summary: d.summary.trim() || null,
    status: d.status,
    giver_npc_id: d.giverNpcId || null,
    location_id: d.locationId || null,
    parent_quest_id: d.parentQuestId || null,
    entry_beat_id: d.entryBeatId || null,
    tags: d.tags,
    player_visible_to: d.playerVisibleTo,
  };
}

// The quest the draft was seeded from. A save that fires after the prop has moved
// on to another quest (the debounce outlives the navigation) must still land on
// the quest the DM was editing, not the one now on screen.
let draftQuestId = props.quest.id;
let draftWasShared = props.quest.player_visible_to.length > 0;

const { status, saveError, saveNow, reset } = useAutosave({
  draft,
  initial: () => questToDraft(shown.value),
  equal: draftValueEqual,
  async save(snapshot) {
    // Only the columns the DM changed here: the run cockpit also writes `status`,
    // and a metadata save must not put a stale lane back (#946).
    const update = changes(metadataRow);
    const nextTitle = snapshot.title.trim() || "Untitled Quest";
    if (Object.keys(update).length === 0) return;
    await updateQuest({ id: draftQuestId, update });
    // Edits made while the request was in flight are not part of what was sent;
    // they stay unsaved against the old baseline until the refetch confirms it.
    if (draftValueEqual(metadataRow(draft), metadataRow(snapshot))) commit();
    if (!draftWasShared && snapshot.playerVisibleTo.length && campaign.activeCampaignId) {
      void sendCampaignAnnouncement(campaign.activeCampaignId, `📋 Quest shared: "${nextTitle}"`, {
        entity_type: "quest",
        entity_id: draftQuestId,
      });
    }
    draftWasShared = snapshot.playerVisibleTo.length > 0;
  },
});

const parentQuestOptions = computed(() => (allQuests.value ?? [])
  .filter((candidate) => candidate.id !== props.quest.id)
  .map((candidate) => ({ id: candidate.id, name: candidate.title || "Untitled Quest" })));

const beatOptions = computed(() => (beats.value ?? [])
  .map((beat) => ({ id: beat.id, name: beat.title || "Untitled beat" })));

// A refresh of the same quest (our own save echoing back, or a change made
// elsewhere) merges into the draft through useRecordDraft. Another quest flushes
// pending edits to the old one first, then re-seeds both the draft and autosave.
watch(() => props.quest, async (next) => {
  if (next.id === shown.value.id) {
    shown.value = next;
    return;
  }
  await saveNow();
  draftQuestId = next.id;
  draftWasShared = next.player_visible_to.length > 0;
  shown.value = next;
  reset();
});

// A quest with beats always has an entry — the DB would re-default it on the
// next beat write anyway, so clearing the box here is not a state the DM can
// actually choose. The combobox's clear affordance just snaps back.
function onEntryBeatChange(next: string) {
  draft.entryBeatId = next || (props.quest.entry_beat_id ?? "");
}

function onRevealChange(next: string[]) {
  draft.playerVisibleTo = next;
}
</script>
