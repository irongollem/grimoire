<template>
  <EntityLightbox :open="true" :portrait-src="portraitSrc" :portrait-alt="attachment.label" max-width="2xl" @close="emit('close')">
      <section aria-label="Contained quest tool">
        <header class="flex items-start gap-2">
          <div class="min-w-0 flex-1">
            <p class="text-label font-bold uppercase tracking-wider text-primary">{{ adapter.label }} · contained {{ adapter.runAction }}</p>
            <h2 class="truncate font-cinzel text-lg font-bold text-foreground">{{ attachment.label }}</h2>
            <p v-if="attachment.compact_detail" class="text-caption text-muted-foreground">{{ attachment.compact_detail }}</p>
          </div>
          <AppButton label="Close" size="sm" variant="subtle" @click="emit('close')" />
        </header>

        <div v-if="encounterFocused" class="mt-4 h-[70vh] min-h-96 overflow-y-auto rounded-lg border border-border bg-background">
          <EncounterRunSurface :encounter-id="attachment.ref_id" />
        </div>
        <p v-if="toolError" role="alert" class="mt-3 rounded-md border border-destructive/40 p-2 text-caption text-destructive">{{ toolError }}</p>
        <div v-else-if="attachment.prep_gap" class="mt-3 rounded-lg border border-tone-caution/50 bg-tone-caution/5 p-3 text-caption text-tone-caution">This attachment is missing. Close this tool and keep running, or use the full editor to repair it.</div>
        <div v-else class="mt-4 space-y-3">
          <div v-if="adapter.containedSurface === 'encounter'" class="rounded-lg border border-border bg-card p-3">
            <p class="text-body text-foreground">Focused encounter state stays in the existing Encounter Runner.</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <AppButton label="Run here" variant="primary" @click="encounterFocused = true" />
              <AppButton :to="specialistUrl(`/encounters/${attachment.ref_id}/run`)" label="Open full-screen" variant="subtle" />
            </div>
          </div>
          <div v-else-if="adapter.containedSurface === 'atlas'" class="rounded-lg border border-border bg-card p-3">
            <p class="text-body font-semibold text-foreground">{{ atlasRoot?.name || attachment.label }}</p>
            <p class="text-caption text-muted-foreground">{{ atlasRoot?.location_type || 'Atlas location' }} · {{ preparedRooms.length }} prepared room{{ preparedRooms.length === 1 ? '' : 's' }}</p>
            <RichTextViewer v-if="atlasRoot?.description" class="mt-2" :content="atlasRoot.description" />
            <p v-if="atlasRoot?.notes" class="mt-2 whitespace-pre-wrap text-caption text-muted-foreground">{{ atlasRoot.notes }}</p>
            <ul v-if="preparedRooms.length" class="mt-3 space-y-2">
              <li v-for="room in preparedRooms" :key="room.id" class="rounded-md border border-border p-2">
                <p class="text-caption font-semibold text-foreground">{{ room.name }}</p>
                <RichTextViewer v-if="room.description" class="mt-1" :content="room.description" />
                <p v-if="room.notes" class="mt-1 whitespace-pre-wrap text-caption text-muted-foreground">{{ room.notes }}</p>
                <p v-if="!room.description && !room.notes" class="mt-1 text-caption italic text-muted-foreground">No room notes prepared.</p>
              </li>
            </ul>
            <p v-else class="mt-2 text-caption italic text-muted-foreground">No room context selected for this beat.</p>
            <p class="mt-2 text-caption text-muted-foreground">Open Atlas for maps, pins, and advanced editing.</p>
          </div>
          <div v-else-if="adapter.containedSurface === 'audio'" class="rounded-lg border border-border bg-card p-3">
            <p v-if="sound" class="text-body text-foreground">{{ sound.category }} · {{ sound.source_type }}</p>
            <AppButton v-if="sound" :label="audioAction(sound)" class="mt-2" variant="primary" :disabled="!!blockedReason(sound)" @click="triggerSound(sound)" />
            <p v-if="sound && blockedReason(sound)" class="mt-1 text-caption text-destructive">{{ blockedReason(sound) }}</p>
            <template v-else-if="playlist">
              <p class="text-body text-foreground">{{ playlist.playlist_type }} scene · {{ playlistTracks.length }} track{{ playlistTracks.length === 1 ? '' : 's' }}</p>
              <AppButton :label="playlistActive ? 'Stop scene' : 'Play scene'" class="mt-2" variant="primary" :disabled="!playlistTracks.length" @click="togglePlaylist" />
            </template>
            <p v-else class="text-body text-foreground">Audio cue is unavailable.</p>
          </div>
          <div v-else-if="attachment.attachment_type === 'npc'" class="rounded-lg border border-border bg-card p-3">
            <p class="text-body text-foreground">{{ npcRecord?.occupation || "No occupation prepared" }} · {{ npcRecord?.status || "unknown status" }}</p>
            <p v-if="npcRecord?.personality" class="mt-2 text-caption text-muted-foreground">{{ npcRecord.personality }}</p>
          </div>
          <div v-else-if="attachment.attachment_type === 'faction'" class="rounded-lg border border-border bg-card p-3">
            <p class="text-body text-foreground">{{ factionRecord?.faction_type || "Faction" }}<template v-if="factionRecord?.alignment"> · {{ factionRecord.alignment }}</template></p>
            <p v-if="factionRecord?.description" class="mt-2 text-caption text-muted-foreground">{{ factionRecord.description }}</p>
          </div>
          <div v-else-if="attachment.attachment_type === 'item'" class="rounded-lg border border-border bg-card p-3">
            <p class="text-body text-foreground">{{ item?.item_type || "Item" }}<template v-if="item?.rarity"> · {{ item.rarity }}</template></p>
            <p v-if="item?.description" class="mt-2 line-clamp-4 text-caption text-muted-foreground">{{ item.description }}</p>
          </div>
          <div v-else-if="attachment.attachment_type === 'monster'" class="rounded-lg border border-border bg-card p-3">
            <p class="text-body text-foreground">{{ monster?.size || "Unknown size" }} {{ monster?.monster_type || "monster" }}</p>
            <p v-if="monster?.description" class="mt-2 line-clamp-4 text-caption text-muted-foreground">{{ monster.description }}</p>
          </div>
          <div v-else-if="attachment.attachment_type === 'objective'" class="rounded-lg border border-border bg-card p-3">
            <p class="text-body text-foreground">{{ objective?.description || attachment.label }}</p>
            <AppButton
              v-if="objective"
              class="mt-2"
              :label="objective.is_done ? 'Reopen objective' : 'Mark complete'"
              variant="primary"
              :loading="objectiveSaving"
              @click="toggleObjective"
            />
          </div>
          <div v-else-if="attachment.attachment_type === 'note'" class="rounded-lg border border-border bg-card p-3">
            <LoadingSpinner v-if="noteQuery.isLoading.value" />
            <template v-else-if="noteRecord">
              <p class="text-caption text-muted-foreground">{{ noteRecord.category }}<template v-if="noteRecord.tags.length"> · {{ noteRecord.tags.join(', ') }}</template></p>
              <RichTextViewer v-if="noteRecord.content" class="mt-2" :content="noteRecord.content" />
              <p v-else class="mt-2 text-caption italic text-muted-foreground">This note has no body yet.</p>
            </template>
            <p v-else class="text-caption text-tone-caution">The attached note could not be loaded.</p>
          </div>
          <div v-else-if="attachment.attachment_type === 'handout'" class="rounded-lg border border-border bg-card p-3">
            <LoadingSpinner v-if="handoutQuery.isLoading.value" />
            <template v-else-if="handoutRecord">
              <p class="text-caption text-muted-foreground">{{ handoutRecord.doc_type }} · {{ handoutRecord.word_count }} words · {{ handoutRecord.is_published ? 'published' : 'draft' }}</p>
              <RichTextViewer v-if="handoutRecord.content" class="mt-2" :content="handoutRecord.content" />
              <p v-else class="mt-2 text-caption italic text-muted-foreground">This handout has no body yet.</p>
            </template>
            <p v-else class="text-caption text-tone-caution">The attached handout could not be loaded.</p>
          </div>
          <div v-else class="rounded-lg border border-border bg-card p-3">
            <p class="text-body text-foreground">{{ attachment.compact_detail || "Authoritative campaign record" }}</p>
            <p class="text-caption text-muted-foreground">This quick view keeps the session in place; advanced editing stays in the existing specialist.</p>
          </div>
        </div>

        <footer class="mt-4 flex justify-end gap-2">
          <AppButton v-if="encounterFocused" label="Encounter summary" variant="subtle" @click="encounterFocused = false" />
          <AppButton v-if="attachment.full_editor_to" :to="specialistUrl(attachment.full_editor_to)" label="Open full editor" variant="subtle" />
          <AppButton label="Back to beat" variant="primary" @click="emit('close')" />
        </footer>
      </section>
  </EntityLightbox>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from "vue";
import { useHotkeys } from "@/composables/useHotkeys";
import { useAllLocations } from "@/composables/useLocations";
import { useNpc } from "@/composables/useNpcs";
import { useFaction } from "@/composables/useFactions";
import { useItems } from "@/composables/useItems";
import { useResolvedMonster } from "@/composables/useMonsters";
import { useNote } from "@/composables/useNotes";
import { useScriptoriumDocument } from "@/composables/useScriptorium";
import { useSounds } from "@/composables/useSounds";
import { usePlaylists, usePlaylistTracks } from "@/composables/useSoundboardPlaylists";
import { useActionCheck, useBlockedCheck, useSoundTrigger } from "@/composables/useSoundPlayback";
import { QUEST_BEAT_ATTACHMENT_ADAPTERS } from "@/lib/quests/attachments";
import { withQuestReturnTo } from "@/lib/quests/navigation";
import { useSoundboardStore } from "@/stores/soundboard";
import { useQuestObjectives, useUpdateObjective } from "@/composables/useQuests";
import type { QuestBeatAttachmentSummary } from "@/types/quest.types";
import type { Sound } from "@/types/sound.types";
import AppButton from "@/components/common/AppButton.vue";
import EntityLightbox from "@/components/common/EntityLightbox.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const EncounterRunSurface = defineAsyncComponent(() => import("@/components/encounters/EncounterRunSurface.vue"));

const props = defineProps<{ attachment: QuestBeatAttachmentSummary; returnTo: string }>();
const emit = defineEmits<{ close: [] }>();
const encounterFocused = ref(false);
const objectiveSaving = ref(false);
const toolError = ref("");
const adapter = computed(() => QUEST_BEAT_ATTACHMENT_ADAPTERS[props.attachment.attachment_type]);
const { data: locations } = useAllLocations(() => props.attachment.attachment_type === "location_set");
const npcId = computed(() => props.attachment.attachment_type === "npc" ? props.attachment.ref_id : "");
const factionId = computed(() => props.attachment.attachment_type === "faction" ? props.attachment.ref_id : "");
const monsterId = computed(() => props.attachment.attachment_type === "monster" ? props.attachment.ref_id : "");
const noteId = computed(() => props.attachment.attachment_type === "note" ? props.attachment.ref_id : "");
const handoutId = computed(() => props.attachment.attachment_type === "handout" ? props.attachment.ref_id : "");
const { data: npc } = useNpc(npcId);
const { data: faction } = useFaction(factionId);
const monsterQuery = useResolvedMonster(monsterId);
const noteQuery = useNote(noteId);
const handoutQuery = useScriptoriumDocument(handoutId);
const npcRecord = computed(() => npc.value ?? null);
const factionRecord = computed(() => faction.value ?? null);
const monster = computed(() => monsterQuery.data.value?.monster ?? null);
const noteRecord = computed(() => noteQuery.data.value ?? null);
const handoutRecord = computed(() => handoutQuery.data.value ?? null);
const objectiveQuestId = computed(() => props.attachment.attachment_type === "objective" ? props.attachment.quest_id : "");
const { data: objectives } = useQuestObjectives(objectiveQuestId);
const updateObjective = useUpdateObjective();
const objective = computed(() => props.attachment.attachment_type === "objective" ? objectives.value?.find((row) => row.id === props.attachment.ref_id) ?? null : null);
const { data: items } = useItems(() => ({ enabled: props.attachment.attachment_type === "item" }));
const item = computed(() => props.attachment.attachment_type === "item" ? items.value?.find((row) => row.id === props.attachment.ref_id) ?? null : null);
const portraitSrc = computed(() => npcRecord.value?.portrait_url ?? factionRecord.value?.emblem_url ?? item.value?.image_url ?? monster.value?.image_url ?? null);
const { data: sounds } = useSounds(() => props.attachment.attachment_type === "sound");
const { data: playlists } = usePlaylists(() => props.attachment.attachment_type === "playlist");
const playlistId = computed(() => props.attachment.attachment_type === "playlist" ? props.attachment.ref_id : null);
const { data: playlistTracksData } = usePlaylistTracks(playlistId);
const soundboard = useSoundboardStore();
const sound = computed(() => props.attachment.attachment_type === "sound" ? sounds.value?.find((row) => row.id === props.attachment.ref_id) ?? null : null);
const playlist = computed(() => props.attachment.attachment_type === "playlist" ? playlists.value?.find((row) => row.id === props.attachment.ref_id) ?? null : null);
const playlistTracks = computed(() => playlistTracksData.value ?? []);
const playlistActive = computed(() => playlist.value ? soundboard.isPlaylistActive(playlist.value.id) : false);
const triggerSound = useSoundTrigger();
const actionFor = useActionCheck();
const blockedReason = useBlockedCheck();
const audioAction = (value: Sound) => ({ play: "Play cue", pause: "Pause cue", refire: "Fire cue again" })[actionFor(value)];
const roomIds = computed(() => new Set(Array.isArray(props.attachment.metadata.room_ids) ? props.attachment.metadata.room_ids.map(String) : []));
const atlasRoot = computed(() => (locations.value ?? []).find((location) => location.id === props.attachment.ref_id) ?? null);
const preparedRooms = computed(() => (locations.value ?? []).filter((location) => roomIds.value.has(location.id)));
const specialistUrl = (path: string) => withQuestReturnTo(path, props.returnTo);
function togglePlaylist() {
  if (!playlist.value) return;
  if (playlistActive.value) soundboard.stopPlaylist(playlist.value.playlist_type, playlist.value.id);
  else if (playlistTracks.value.length) soundboard.playPlaylist(playlist.value, playlistTracks.value);
}
async function toggleObjective() {
  if (!objective.value) return;
  objectiveSaving.value = true;
  toolError.value = "";
  try {
    await updateObjective.mutateAsync({
      id: objective.value.id,
      questId: objective.value.quest_id,
      update: { is_done: !objective.value.is_done },
    });
  } catch (caught) {
    toolError.value = caught instanceof Error ? caught.message : "The objective could not be updated";
  } finally { objectiveSaving.value = false; }
}
useHotkeys([{ combo: "escape", description: "Close contained quest tool", handler: () => emit("close"), hidden: true }], { layer: "overlay" });
</script>
