<template>
  <section class="space-y-2 rounded-lg border border-border bg-card p-3" aria-label="Details">
    <div class="flex items-center gap-3">
      <h3 class="min-w-0 flex-1 text-heading-sm font-bold text-foreground">Details</h3>
      <AutosaveStatus :status="status" :error="saveError" />
    </div>
    <DraftConflictNotice :fields="conflictLabels" :on-discard="resetDraft" />

    <!-- No premise label: the field says what it is, and the drawer is narrow. -->
    <AppInput
      v-model="draft.summary"
      tone="card"
      size="body-xs"
      aria-label="Premise"
      :maxlength="QUEST_SUMMARY_MAX"
      placeholder="Premise (players see this)"
    />

    <div class="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
      <label class="contents">
        <span class="text-caption font-semibold text-muted-foreground">Board lane</span>
        <AppSelect v-model="draft.status" size="sm" block>
          <option v-for="value in QUEST_STATUSES" :key="value" :value="value">{{ QUEST_STATUS_LABELS[value] }}</option>
        </AppSelect>
      </label>

      <label class="contents">
        <span class="text-caption font-semibold text-muted-foreground">Giver</span>
        <EntityCombobox v-model="draft.giverNpcId" :options="npcs ?? []" :selected-label="giver?.name ?? null" placeholder="Search NPCs…" @open="npcListWanted = true" />
      </label>

      <label class="contents">
        <span class="text-caption font-semibold text-muted-foreground">Location</span>
        <EntityCombobox v-model="draft.locationId" :options="locations ?? []" :selected-label="primaryLocation?.name ?? null" placeholder="Search locations…" @open="locationListWanted = true" />
      </label>

      <label class="contents">
        <span class="text-caption font-semibold text-muted-foreground">Part of</span>
        <EntityCombobox v-model="draft.parentQuestId" :options="parentQuestOptions" placeholder="Search quests…" />
      </label>

      <span class="self-start pt-1.5 text-caption font-semibold text-muted-foreground">Tags</span>
      <TagInput v-model="draft.tags" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import DraftConflictNotice from "@/components/common/feedback/DraftConflictNotice.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import TagInput from "@/components/common/controls/TagInput.vue";
import { useAllLocations, useLocation } from "@/composables/locations/useLocations";
import { useNpc, useNpcs } from "@/composables/npcs/useNpcs";
import { useQuests, useUpdateQuest } from "@/composables/quests/useQuests";
import { useAutosave } from "@/composables/useAutosave";
import { draftValueEqual, useRecordDraft } from "@/composables/useRecordDraft";
import AppInput from "@/components/common/controls/AppInput.vue";
import { QUEST_SUMMARY_MAX } from "@/lib/quests/summary";
import { QUEST_STATUSES, QUEST_STATUS_LABELS, type Quest, type QuestStatus } from "@/types/quest.types";

// The title is the page header's and the opening beat is set on a beat, so
// neither is a field here; sharing is the Players section's own write.
interface DetailsDraft {
  summary: string;
  status: QuestStatus;
  giverNpcId: string;
  locationId: string;
  parentQuestId: string;
  tags: string[];
}

const props = defineProps<{ quest: Quest }>();
// The campaign's NPC and place lists are read when a picker is first opened,
// not at mount: the closed field only needs the one selected name, which the
// single-row reads below give (and live sync keeps current).
const npcListWanted = ref(false);
const locationListWanted = ref(false);
const { data: npcs } = useNpcs(() => npcListWanted.value);
const { data: locations } = useAllLocations(() => locationListWanted.value);
const { data: allQuests } = useQuests();
const { mutateAsync: updateQuest } = useUpdateQuest();

function questToDraft(quest: Quest): DetailsDraft {
  return {
    summary: quest.summary ?? "",
    status: quest.status,
    giverNpcId: quest.giver_npc_id ?? "",
    locationId: quest.location_id ?? "",
    parentQuestId: quest.parent_quest_id ?? "",
    tags: [...quest.tags],
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

const { data: giver } = useNpc(computed(() => draft.giverNpcId));
const { data: primaryLocation } = useLocation(() => draft.locationId || null);

const CONFLICT_LABELS: Record<keyof DetailsDraft, string> = {
  summary: "Premise",
  status: "Board lane",
  giverNpcId: "Quest giver",
  locationId: "Primary location",
  parentQuestId: "Part of quest",
  tags: "Tags",
};
const conflictLabels = computed(() => conflicts.value.map((key) => CONFLICT_LABELS[key]));

/** Pure function of the draft, so a column the DM never touched is left out of the write. */
function detailsRow(d: DetailsDraft) {
  return {
    summary: d.summary.trim() || null,
    status: d.status,
    giver_npc_id: d.giverNpcId || null,
    location_id: d.locationId || null,
    parent_quest_id: d.parentQuestId || null,
    tags: d.tags,
  };
}

// The quest the draft was seeded from. A save that fires after the prop has moved
// on to another quest (the debounce outlives the navigation) must still land on
// the quest the DM was editing, not the one now on screen.
let draftQuestId = props.quest.id;

const { status, saveError, saveNow, reset } = useAutosave({
  draft,
  initial: () => questToDraft(shown.value),
  equal: draftValueEqual,
  async save(snapshot) {
    // Only the columns the DM changed here: the run cockpit also writes `status`,
    // and a details save must not put a stale lane back (#946).
    const update = changes(detailsRow);
    if (Object.keys(update).length === 0) return;
    await updateQuest({ id: draftQuestId, update });
    // Edits made while the request was in flight are not part of what was sent;
    // they stay unsaved against the old baseline until the refetch confirms it.
    if (draftValueEqual(detailsRow(draft), detailsRow(snapshot))) commit();
  },
});

const parentQuestOptions = computed(() => (allQuests.value ?? [])
  .filter((candidate) => candidate.id !== props.quest.id)
  .map((candidate) => ({ id: candidate.id, name: candidate.title || "Untitled Quest" })));

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
  shown.value = next;
  reset();
});
</script>
