<template>
  <section class="space-y-3 rounded-xl border border-border bg-card p-3" aria-label="Placements">
    <header class="flex items-center gap-2">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Placements</h3>
      <span class="ml-auto font-fell text-caption text-muted-foreground">NPCs, monsters, encounters, rolls</span>
    </header>

    <ul v-if="attachments.length" class="space-y-1.5">
      <li v-for="attachment in attachments" :key="attachment.id" class="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border p-2 text-caption">
        <span
          class="flex h-4 w-4 shrink-0 items-center justify-center rounded"
          :class="attachment.is_required
            ? (attachment.target_exists ? 'bg-tone-success text-white' : 'border border-dashed border-tone-caution text-ink-caution')
            : 'border border-border text-transparent'"
        >
          <IconCheck v-if="attachment.is_required && attachment.target_exists" class="h-2.5 w-2.5" />
          <IconWarning v-else-if="attachment.is_required" class="h-2.5 w-2.5" />
          <span class="sr-only">{{ attachment.is_required ? (attachment.target_exists ? 'Required, present' : 'Required, missing — prep gap') : 'Optional' }}</span>
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate font-cinzel text-label-lg font-bold text-foreground">{{ attachment.label }}</p>
          <p class="truncate text-muted-foreground">{{ attachment.compact_detail || (attachment.is_required ? '' : 'Optional fallback — kept out of the prep-gap count') }}</p>
        </div>
        <AppButton
          :label="attachment.is_required ? 'Needed' : 'Optional'"
          :title="attachment.is_required
            ? 'The beat cannot run without this — flags a prep gap if the material goes missing'
            : 'Nice to have — its absence never flags a prep gap'"
          size="xs"
          variant="subtle"
          :active="attachment.is_required"
          :aria-pressed="attachment.is_required"
          :loading="updatingId === attachment.id"
          :disabled="!!updatingId && updatingId !== attachment.id"
          @click="setRequired(attachment, !attachment.is_required)"
        />
        <AppButton v-if="attachment.target_exists" label="Edit" size="xs" variant="subtle" @click="opened = attachment" />
        <AppButton v-else label="Attach" size="xs" @click="attachmentType = attachment.attachment_type" />
        <AppButton label="Remove" size="xs" variant="subtle" :loading="removingId === attachment.id" @click="remove(attachment.id)" />
      </li>
    </ul>

    <!-- Opening a placement used to navigate to the material's own screen, which
         for an NPC means the NPC list with its detail modal on top — the DM lost
         the beat they were preparing to look up one fact. The Run cockpit already
         had a contained view for exactly this; prep now uses the same one, and it
         still carries "Open full editor" for the times a real edit is wanted. -->
    <QuestRunContainedTool
      v-if="opened"
      :attachment="opened"
      :return-to="`/quests/${beat.quest_id}/beats/${beat.id}`"
      @close="opened = null"
    />
    <p v-else class="text-caption italic text-muted-foreground">Nothing placed on this beat yet.</p>

    <div data-testid="beat-attachment-form" class="grid min-w-0 grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-2">
      <AppSelect v-model="attachmentType" class="min-w-0" aria-label="Attachment type">
        <option v-for="type in supportedTypes" :key="type" :value="type">{{ adapterLabel(type) }}</option>
      </AppSelect>
      <EntityCombobox v-if="attachmentType !== 'check'" v-model="refId" class="min-w-0" :options="options" :placeholder="`Find ${adapterLabel(attachmentType).toLowerCase()}…`" />
      <AppSelect v-else v-model="checkSkill" class="min-w-0" aria-label="Skill">
        <option v-for="skill in SKILL_OPTIONS" :key="skill" :value="skill">{{ skill }}</option>
      </AppSelect>
      <template v-if="attachmentType === 'check'">
        <div class="col-span-2 grid min-w-0 grid-cols-3 gap-2">
          <AppInput v-model.number="checkDc" type="number" class="min-w-0" placeholder="DC" aria-label="DC" />
          <AppSelect v-model="checkContestedBy" class="min-w-0" aria-label="Contested by (optional)">
            <option value="">Not contested</option>
            <option v-for="skill in SKILL_OPTIONS" :key="skill" :value="skill">{{ skill }}</option>
          </AppSelect>
          <AppInput v-model="checkNote" class="min-w-0" placeholder="Note (optional)" aria-label="Note" />
        </div>
      </template>
      <div class="col-span-2 flex min-w-0 flex-wrap justify-end gap-2">
        <AppButton label="Place" size="sm" :disabled="!canPlace" :loading="adding" @click="add" />
        <AppButton v-if="attachmentType !== 'check'" :to="createUrl" label="Create new" size="sm" variant="subtle" />
      </div>
    </div>
    <div v-if="attachmentType === 'encounter'" class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-dashed border-border p-2">
      <AppInput v-model="quickEncounterName" class="min-w-0" placeholder="Quick encounter name…" />
      <AppButton label="Create & place" size="sm" variant="subtle" :disabled="!quickEncounterName.trim()" :loading="quickCreating" @click="quickCreateEncounter" />
    </div>
    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useCreateQuestBeatAttachment, useDeleteQuestBeatAttachment, useSetQuestBeatAttachmentRequired } from "@/composables/quests/useQuestFlow";
import { useCreateEncounter, useEncounters } from "@/composables/encounters/useEncounters";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useNotes } from "@/composables/notes/useNotes";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useItems } from "@/composables/items/useItems";
import { useMonsters } from "@/composables/monsters/useMonsters";
import { useScriptoriumDocuments } from "@/composables/scriptorium/useScriptorium";
import { usePlaylists } from "@/composables/soundboard/useSoundboardPlaylists";
import { useSounds } from "@/composables/soundboard/useSounds";
import { QUEST_BEAT_ATTACHMENT_ADAPTERS } from "@/lib/quests/attachments";
import { withQuestReturnTo } from "@/lib/quests/navigation";
import { IconCheck, IconWarning } from "@/lib/icons";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import { SKILLS } from "@/types/party.types";
import type { QuestBeat, QuestBeatAttachmentSummary, QuestBeatAttachmentType, QuestCheckAttachmentMetadata } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import QuestRunContainedTool from "./QuestRunContainedTool.vue";

const props = defineProps<{ beat: QuestBeat; attachments: QuestBeatAttachmentSummary[] }>();
const supportedTypes: QuestBeatAttachmentType[] = ["encounter", "check", "npc", "faction", "item", "monster", "sound", "audio_scene", "playlist", "note", "handout"];
const SKILL_OPTIONS = SKILLS.map((skill) => skill.label);
const attachmentType = ref<QuestBeatAttachmentType>("encounter");
const refId = ref("");
const checkSkill = ref(SKILL_OPTIONS[0] ?? "");
const checkDc = ref<number | null>(null);
const checkContestedBy = ref("");
const checkNote = ref("");
const adding = ref(false);
const quickCreating = ref(false);
const quickEncounterName = ref("");
const opened = ref<QuestBeatAttachmentSummary | null>(null);
const removingId = ref("");
const updatingId = ref("");
const error = ref("");
const createAttachment = useCreateQuestBeatAttachment();
const deleteAttachment = useDeleteQuestBeatAttachment();
const updateRequired = useSetQuestBeatAttachmentRequired();
const createEncounter = useCreateEncounter();
const { data: encounters } = useEncounters();
const { data: npcs } = useNpcs();
const { data: factions } = useAllFactions();
const { data: items } = useItems();
const { data: monsters } = useMonsters();
const { data: sounds } = useSounds();
const { data: playlists } = usePlaylists();
const { data: notes } = useNotes();
const { data: documents } = useScriptoriumDocuments();

const options = computed<Array<{ id: string; name: string }>>(() => ({
  encounter: (encounters.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  check: [],
  npc: (npcs.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  faction: (factions.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  item: (items.value ?? []).filter((row) => !!row.user_id).map((row) => ({ id: row.id, name: row.name })),
  monster: (monsters.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  sound: (sounds.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  audio_scene: (playlists.value ?? []).filter((row) => row.playlist_type === "ambient").map((row) => ({ id: row.id, name: row.name })),
  playlist: (playlists.value ?? []).filter((row) => row.playlist_type === "music").map((row) => ({ id: row.id, name: row.name })),
  note: (notes.value ?? []).map((row) => ({ id: row.id, name: row.title })),
  handout: (documents.value ?? []).map((row) => ({ id: row.id, name: row.title })),
}[attachmentType.value]));
const CREATE_URLS: Record<Exclude<QuestBeatAttachmentType, "check">, string> = {
  encounter: "/encounters/new",
  npc: "/npcs/new",
  faction: "/factions/new",
  item: "/vault/new",
  monster: "/monsters/new",
  sound: "/soundboard",
  audio_scene: "/soundboard",
  playlist: "/soundboard",
  note: "/notes/new",
  handout: "/scriptorium/new",
};
const createUrl = computed(() => {
  const type = attachmentType.value;
  return type === "check" ? "" : withQuestReturnTo(CREATE_URLS[type], `/quests/${props.beat.quest_id}/beats/${props.beat.id}`);
});
const canPlace = computed(() => attachmentType.value === "check"
  ? checkSkill.value !== "" && checkDc.value !== null && !Number.isNaN(checkDc.value)
  : !!refId.value);

watch(attachmentType, () => { refId.value = ""; error.value = ""; });

function adapterLabel(type: QuestBeatAttachmentType) {
  return QUEST_BEAT_ATTACHMENT_ADAPTERS[type].label;
}

async function add() {
  const type = attachmentType.value;
  if (type === "check") { await addCheck(); return; }
  if (!refId.value) return;
  adding.value = true;
  error.value = "";
  try {
    await createAttachment.mutateAsync({
      beat_id: props.beat.id,
      quest_id: props.beat.quest_id,
      campaign_id: props.beat.campaign_id,
      attachment_type: type,
      ref_id: refId.value,
      metadata: {},
    });
    refId.value = "";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Could not place this material";
  } finally { adding.value = false; }
}

async function addCheck() {
  if (checkSkill.value === "" || checkDc.value === null || Number.isNaN(checkDc.value)) return;
  adding.value = true;
  error.value = "";
  try {
    const metadata: QuestCheckAttachmentMetadata = {
      skill: checkSkill.value,
      dc: checkDc.value,
      contested_by: checkContestedBy.value || null,
      note: checkNote.value.trim() || null,
    };
    await createAttachment.mutateAsync({
      beat_id: props.beat.id,
      quest_id: props.beat.quest_id,
      campaign_id: props.beat.campaign_id,
      attachment_type: "check",
      ref_id: "check",
      metadata: metadata as unknown as Record<string, unknown>,
    });
    checkSkill.value = SKILL_OPTIONS[0] ?? "";
    checkDc.value = null;
    checkContestedBy.value = "";
    checkNote.value = "";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Could not place this check";
  } finally { adding.value = false; }
}

async function remove(id: string) {
  removingId.value = id;
  error.value = "";
  try { await deleteAttachment.mutateAsync({ id, questId: props.beat.quest_id }); }
  catch (caught) { error.value = caught instanceof Error ? caught.message : "Could not remove this placement"; }
  finally { removingId.value = ""; }
}

async function setRequired(attachment: QuestBeatAttachmentSummary, isRequired: boolean) {
  updatingId.value = attachment.id;
  error.value = "";
  try {
    await updateRequired.mutateAsync({ id: attachment.id, questId: props.beat.quest_id, isRequired });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Could not change this placement requirement";
  } finally { updatingId.value = ""; }
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
