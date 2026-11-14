<template>
  <section class="flex min-w-0 flex-col gap-2" aria-label="Who and what is here">
    <h3 class="text-heading-sm font-bold text-foreground">Who and what is here</h3>

    <ul v-if="attachments.length" class="space-y-1.5">
      <li v-for="attachment in attachments" :key="attachment.id" class="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2 text-caption">
        <span class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true">
          <span v-if="attachment.attachment_type === 'npc'" class="text-label-lg font-bold">{{ initialOf(attachment.label) }}</span>
          <component :is="ICONS[attachment.attachment_type]" v-else class="h-3.5 w-3.5" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-label-lg font-bold text-foreground">{{ attachment.label }}</p>
          <p class="truncate text-muted-foreground">{{ lineOf(attachment) }}</p>
          <span class="sr-only">{{ attachment.is_required ? (attachment.target_exists ? 'Required, present' : 'Required, missing, prep gap') : 'Optional' }}</span>
        </div>
        <AppButton
          :label="attachment.is_required ? 'Needed' : 'Optional'"
          :title="attachment.is_required
            ? 'The beat cannot run without this. It flags a prep gap if the material goes missing'
            : 'Nice to have: its absence never flags a prep gap'"
          size="xs"
          variant="subtle"
          :active="attachment.is_required"
          :aria-pressed="attachment.is_required"
          :loading="updatingId === attachment.id"
          :disabled="!!updatingId && updatingId !== attachment.id"
          @click="setRequired(attachment, !attachment.is_required)"
        />
        <AppButton v-if="attachment.target_exists" label="Open" size="xs" variant="subtle" @click="emit('open', attachment)" />
        <AppButton v-else label="Attach" size="xs" @click="startAttach(attachment.attachment_type)" />
        <AppButton label="Remove" size="xs" variant="subtle" :loading="removingId === attachment.id" @click="remove(attachment.id)" />
      </li>
    </ul>
    <p v-else class="text-caption italic text-muted-foreground">Nothing placed on this beat yet.</p>

    <div>
      <AppButton label="Link someone or something" :icon="IconAdd" size="xs" variant="subtle" :active="formOpen" :aria-expanded="formOpen" @click="formOpen = !formOpen" />
    </div>

    <Transition v-bind="drawerTransition()">
      <div v-show="formOpen" class="flex min-w-0 flex-col gap-2">
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
      </div>
    </Transition>
    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
  </section>

  <PaywallModal v-model="showPaywall" resource="encounters" />
</template>

<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import { useCreateQuestBeatAttachment, useDeleteQuestBeatAttachment, useSetQuestBeatAttachmentRequired } from "@/composables/quests/useQuestFlow";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { isQuotaExceeded } from "@/lib/quotaError";
import { useCreateEncounter, useEncounters } from "@/composables/encounters/useEncounters";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useNotes } from "@/composables/notes/useNotes";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useScriptoriumDocuments } from "@/scriptorium/composables/useScriptorium";
import { isDocumentUsableIn } from "@/scriptorium/lib/documentScope";
import { usePlaylists } from "@/composables/soundboard/useSoundboardPlaylists";
import { useSounds } from "@/composables/soundboard/useSounds";
import { QUEST_BEAT_ATTACHMENT_ADAPTERS } from "@/lib/quests/attachments";
import { questLinkHref, withQuestReturnTo } from "@/lib/quests/navigation";
import { drawerTransition } from "@/lib/motion";
import { IconDice, IconDocument, IconEncounter, IconFaction, IconMonster, IconMusic, IconMusicNote, IconNote, IconPackage, IconAdd, IconUserRound } from "@/lib/icons";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import { SKILLS } from "@/types/party.types";
import type { QuestBeat, QuestBeatAttachmentSummary, QuestBeatAttachmentType, QuestCheckAttachmentMetadata } from "@/types/quest.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";

/**
 * Frame 10's "Who and what is here": what is placed at the beat, one row each,
 * with the add controls behind one "Link someone or something" button. Opening a
 * placement is the owner's: this emits `open` and the wide part shows the
 * contained tool, so the DM never loses the beat they are preparing.
 */
const props = defineProps<{ beat: QuestBeat; attachments: QuestBeatAttachmentSummary[] }>();
const emit = defineEmits<{ open: [attachment: QuestBeatAttachmentSummary] }>();
const formOpen = ref(false);
const ICONS: Record<QuestBeatAttachmentType, Component> = {
  encounter: IconEncounter, npc: IconUserRound, faction: IconFaction, item: IconPackage, monster: IconMonster, check: IconDice,
  sound: IconMusicNote, audio_scene: IconMusic, playlist: IconMusicNote, note: IconNote, handout: IconDocument,
};
const initialOf = (label: string) => label.trim().charAt(0).toUpperCase();
function lineOf(attachment: QuestBeatAttachmentSummary): string {
  if (attachment.compact_detail) return attachment.compact_detail;
  if (!attachment.target_exists) return "Named in the plan, not written yet";
  return attachment.is_required ? adapterLabel(attachment.attachment_type) : "Optional fallback, kept out of the prep-gap count";
}
function startAttach(type: QuestBeatAttachmentType) {
  attachmentType.value = type;
  formOpen.value = true;
}
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
const removingId = ref("");
const updatingId = ref("");
const error = ref("");
const showPaywall = ref(false);
const createAttachment = useCreateQuestBeatAttachment();
const deleteAttachment = useDeleteQuestBeatAttachment();
const updateRequired = useSetQuestBeatAttachmentRequired();
const createEncounter = useCreateEncounter();
const { data: encounters } = useEncounters();
const { data: npcs } = useNpcs();
const { data: factions } = useAllFactions();
const { data: items } = useItemIndex();
const { data: monsters } = useMonsterIndex();
const { data: sounds } = useSounds();
const { data: playlists } = usePlaylists();
const { data: notes } = useNotes();
const { data: documents } = useScriptoriumDocuments();

const options = computed<Array<{ id: string; name: string }>>(() => ({
  encounter: (encounters.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  check: [],
  npc: (npcs.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  faction: (factions.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  item: (items.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  monster: (monsters.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  sound: (sounds.value ?? []).map((row) => ({ id: row.id, name: row.name })),
  audio_scene: (playlists.value ?? []).filter((row) => row.playlist_type === "ambient").map((row) => ({ id: row.id, name: row.name })),
  playlist: (playlists.value ?? []).filter((row) => row.playlist_type === "music").map((row) => ({ id: row.id, name: row.name })),
  note: (notes.value ?? []).map((row) => ({ id: row.id, name: row.title })),
  // Only handouts usable in the quest's own campaign — account-wide docs plus
  // that campaign's — never another campaign's private prose (#597, #915).
  handout: (documents.value ?? [])
    .filter((row) => isDocumentUsableIn(row, props.beat.campaign_id))
    .map((row) => ({ id: row.id, name: row.title })),
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
  return type === "check" ? "" : withQuestReturnTo(CREATE_URLS[type], questLinkHref(props.beat.quest_id, { beat: props.beat.id, open: true }));
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
      reward_currency_pools: [], location_id: null, is_finished: false, events: [],
      lair_enabled: false, lair_owner_def_id: null, audio_theme: null,
    });
    await createAttachment.mutateAsync({
      beat_id: props.beat.id, quest_id: props.beat.quest_id, campaign_id: props.beat.campaign_id,
      attachment_type: "encounter", ref_id: encounter.id,
    });
    quickEncounterName.value = "";
  } catch (caught) {
    if (isQuotaExceeded(caught)) { showPaywall.value = true; return; }
    error.value = caught instanceof Error ? caught.message : "Could not create this encounter";
  }
  finally { quickCreating.value = false; }
}
</script>
