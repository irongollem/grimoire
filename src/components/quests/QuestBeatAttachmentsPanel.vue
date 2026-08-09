<template>
  <section class="space-y-3 rounded-lg border border-border bg-card p-3" aria-label="Beat attachments">
    <div class="flex items-center gap-2">
      <div>
        <h3 class="font-cinzel text-sm font-bold text-foreground">Prepared material</h3>
        <p class="text-caption text-muted-foreground">Place existing campaign material here; its specialist editor stays authoritative.</p>
      </div>
    </div>

    <ul v-if="attachments.length" class="space-y-1.5">
      <li v-for="attachment in attachments" :key="attachment.id" class="flex items-center gap-2 rounded-md border border-border p-2 text-caption">
        <span class="rounded bg-muted px-1.5 py-0.5 uppercase text-muted-foreground">{{ adapterLabel(attachment.attachment_type) }}</span>
        <span class="min-w-0 flex-1 truncate" :class="attachment.prep_gap ? 'text-tone-caution' : 'text-foreground'">{{ attachment.label }}</span>
        <AppButton v-if="attachment.full_editor_to" :to="specialistUrl(attachment.full_editor_to)" label="Open" size="xs" variant="subtle" />
        <AppButton label="Remove" size="xs" variant="subtle" :loading="removingId === attachment.id" @click="remove(attachment.id)" />
      </li>
    </ul>
    <p v-else class="text-caption italic text-muted-foreground">Nothing placed on this beat yet.</p>

    <div class="grid gap-2 sm:grid-cols-[9rem_1fr_auto_auto]">
      <AppSelect v-model="attachmentType" aria-label="Attachment type">
        <option v-for="type in supportedTypes" :key="type" :value="type">{{ adapterLabel(type) }}</option>
      </AppSelect>
      <EntityCombobox v-model="refId" :options="options" :placeholder="`Find ${adapterLabel(attachmentType).toLowerCase()}…`" />
      <AppButton label="Place" size="sm" :disabled="!refId" :loading="adding" @click="add" />
      <AppButton :to="createUrl" label="Create new" size="sm" variant="subtle" />
    </div>
    <div v-if="attachmentType === 'encounter'" class="flex gap-2 rounded-md border border-dashed border-border p-2">
      <AppInput v-model="quickEncounterName" placeholder="Quick encounter name…" />
      <AppButton label="Create & place" size="sm" variant="subtle" :disabled="!quickEncounterName.trim()" :loading="quickCreating" @click="quickCreateEncounter" />
    </div>
    <fieldset v-if="attachmentType === 'location_set' && refId && roomOptions.length" class="space-y-1 rounded-md border border-dashed border-border p-2">
      <legend class="px-1 text-caption font-medium text-foreground">Rooms included</legend>
      <p class="text-caption text-muted-foreground">The selected location is the root. Choose the rooms needed for this beat.</p>
      <label v-for="room in roomOptions" :key="room.id" class="flex items-center gap-2 text-caption text-foreground">
        <input v-model="selectedRoomIds" type="checkbox" :value="room.id" />
        <span>{{ room.name }}</span>
      </label>
    </fieldset>
    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useCreateQuestBeatAttachment, useDeleteQuestBeatAttachment } from "@/composables/useQuestFlow";
import { useCreateEncounter, useEncounters } from "@/composables/useEncounters";
import { useAllFactions } from "@/composables/useFactions";
import { useAllLocations } from "@/composables/useLocations";
import { useNotes } from "@/composables/useNotes";
import { useNpcs } from "@/composables/useNpcs";
import { useQuestObjectives } from "@/composables/useQuests";
import { useScriptoriumDocuments } from "@/composables/useScriptorium";
import { usePlaylists } from "@/composables/useSoundboardPlaylists";
import { useSounds } from "@/composables/useSounds";
import { QUEST_BEAT_ATTACHMENT_ADAPTERS } from "@/lib/quests/attachments";
import { withQuestReturnTo } from "@/lib/quests/navigation";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import type { QuestBeat, QuestBeatAttachmentSummary, QuestBeatAttachmentType } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const props = defineProps<{ beat: QuestBeat; attachments: QuestBeatAttachmentSummary[] }>();
const supportedTypes: QuestBeatAttachmentType[] = ["encounter", "objective", "location_set", "npc", "faction", "sound", "playlist", "note", "handout"];
const attachmentType = ref<QuestBeatAttachmentType>("encounter");
const refId = ref("");
const adding = ref(false);
const quickCreating = ref(false);
const quickEncounterName = ref("");
const selectedRoomIds = ref<string[]>([]);
const removingId = ref("");
const error = ref("");
const createAttachment = useCreateQuestBeatAttachment();
const deleteAttachment = useDeleteQuestBeatAttachment();
const createEncounter = useCreateEncounter();
const { data: encounters } = useEncounters();
const { data: objectives } = useQuestObjectives(computed(() => props.beat.quest_id));
const { data: locations } = useAllLocations();
const { data: npcs } = useNpcs();
const { data: factions } = useAllFactions();
const { data: sounds } = useSounds();
const { data: playlists } = usePlaylists();
const { data: notes } = useNotes();
const { data: documents } = useScriptoriumDocuments();

const options = computed<Array<{ id: string; name: string }>>(() => ({
  encounter: (encounters.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  objective: (objectives.value ?? []).map((row) => ({ id: row.id, name: row.description })),
  location_set: (locations.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  npc: (npcs.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  faction: (factions.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  sound: (sounds.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  playlist: (playlists.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  note: (notes.value ?? []).map((row) => ({ id: row.id, name: row.title })),
  handout: (documents.value ?? []).map((row) => ({ id: row.id, name: row.title })),
  quest_ref: [],
}[attachmentType.value]));
const roomOptions = computed(() => {
  if (!refId.value) return [];
  const rows = locations.value ?? [];
  const descendantIds = new Set<string>();
  let parentIds = new Set([refId.value]);
  while (parentIds.size) {
    const nextParents = new Set<string>();
    for (const location of rows) {
      if (location.parent_id && parentIds.has(location.parent_id) && !descendantIds.has(location.id)) {
        descendantIds.add(location.id);
        nextParents.add(location.id);
      }
    }
    parentIds = nextParents;
  }
  return rows.filter((location) => descendantIds.has(location.id)).map((location) => ({ id: location.id, name: location.name }));
});
const createUrl = computed(() => withQuestReturnTo(({
  encounter: "/encounters/new",
  objective: `/quests/${props.beat.quest_id}?edit=true`,
  location_set: "/locations/new",
  npc: "/npcs/new",
  faction: "/factions/new",
  sound: "/soundboard",
  playlist: "/soundboard",
  note: "/notes/new",
  handout: "/scriptorium/new",
  quest_ref: `/quests/${props.beat.quest_id}?edit=true`,
})[attachmentType.value], `/quests/${props.beat.quest_id}/beats/${props.beat.id}`));

watch(attachmentType, () => { refId.value = ""; selectedRoomIds.value = []; error.value = ""; });
watch(refId, () => { selectedRoomIds.value = []; });

function adapterLabel(type: QuestBeatAttachmentType) {
  return QUEST_BEAT_ATTACHMENT_ADAPTERS[type].label;
}

function specialistUrl(path: string) {
  return withQuestReturnTo(path, `/quests/${props.beat.quest_id}/beats/${props.beat.id}`);
}

async function add() {
  if (!refId.value) return;
  adding.value = true;
  error.value = "";
  try {
    await createAttachment.mutateAsync({
      beat_id: props.beat.id,
      quest_id: props.beat.quest_id,
      campaign_id: props.beat.campaign_id,
      attachment_type: attachmentType.value,
      ref_id: refId.value,
      metadata: attachmentType.value === "location_set" ? { room_ids: selectedRoomIds.value } : {},
    });
    refId.value = "";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Could not place this material";
  } finally { adding.value = false; }
}

async function remove(id: string) {
  removingId.value = id;
  error.value = "";
  try { await deleteAttachment.mutateAsync({ id, questId: props.beat.quest_id }); }
  catch (caught) { error.value = caught instanceof Error ? caught.message : "Could not remove this placement"; }
  finally { removingId.value = ""; }
}

async function quickCreateEncounter() {
  if (!quickEncounterName.value.trim()) return;
  quickCreating.value = true;
  error.value = "";
  try {
    const encounter = await createEncounter.mutateAsync({
      name: quickEncounterName.value.trim(), description: null, party_member_ids: [], companion_ids: [],
      party_member_factions: {}, combatants: [], factions: DEFAULT_FACTIONS, item_ids: [], trap_ids: [],
      reward_currency_pools: [], art_objects: [], location_id: null, is_finished: false, events: [],
      lair_enabled: false, lair_owner_def_id: null, audio_theme: null,
    });
    await createAttachment.mutateAsync({
      beat_id: props.beat.id, quest_id: props.beat.quest_id, campaign_id: props.beat.campaign_id,
      attachment_type: "encounter", ref_id: encounter.id,
    });
    quickEncounterName.value = "";
  } catch (caught) { error.value = caught instanceof Error ? caught.message : "Could not create this encounter"; }
  finally { quickCreating.value = false; }
}
</script>
