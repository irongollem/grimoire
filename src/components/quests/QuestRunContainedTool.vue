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
        <template v-else>
          <div v-if="attachment.prep_gap" class="mt-3 rounded-lg border border-tone-caution/50 bg-tone-caution/5 p-3 text-caption text-tone-caution">This attachment is missing. Close this tool and keep running, or use the full editor to repair it.</div>
          <div v-else class="mt-4 space-y-3">
          <div v-if="adapter.containedSurface === 'encounter'" class="rounded-lg border border-border bg-card p-3">
            <p class="text-body text-foreground">Focused encounter state stays in the existing Encounter Runner.</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <AppButton label="Run here" variant="primary" @click="encounterFocused = true" />
              <AppButton :to="specialistUrl(`/encounters/${attachment.ref_id}/run`)" label="Open full-screen" variant="subtle" />
            </div>
          </div>
          <div v-else-if="adapter.containedSurface === 'audio'" class="rounded-lg border border-border bg-card p-3">
            <template v-if="sound">
              <p class="text-body text-foreground">{{ sound.category }} · {{ sound.source_type }}</p>
              <AppButton :label="audioAction(sound)" class="mt-2" variant="primary" :disabled="!!blockedReason(sound)" @click="fireSoundCue" />
              <p v-if="blockedReason(sound)" class="mt-1 text-caption text-destructive">{{ blockedReason(sound) }}</p>
            </template>
            <template v-else-if="playlist">
              <p class="text-body text-foreground">{{ attachment.attachment_type === 'audio_scene' ? 'Ambient scene' : 'Music playlist' }} · {{ playlistTracks.length }} track{{ playlistTracks.length === 1 ? '' : 's' }}</p>
              <AppButton :label="playlistActionLabel" class="mt-2" variant="primary" :disabled="!playlistTracks.length" @click="toggleCuePlaylist" />
            </template>
            <p v-else class="text-body text-foreground">Audio cue is unavailable.</p>
          </div>
          <div v-else-if="adapter.containedSurface === 'check'" class="rounded-lg border border-border bg-card p-4 text-center">
            <p class="font-cinzel text-2xl font-bold text-foreground">{{ checkMetadata.skill }} DC {{ checkMetadata.dc }}</p>
            <p v-if="checkMetadata.contested_by" class="mt-1 text-caption text-muted-foreground">Contested by {{ checkMetadata.contested_by }}</p>
            <p v-else-if="checkMetadata.note" class="mt-1 text-caption text-muted-foreground">{{ checkMetadata.note }}</p>
            <AppButton label="Roll" :icon="IconDice" variant="primary" class="mt-3" :loading="rolling" @click="rollCheck" />
            <p v-if="lastRoll !== null" class="mt-2 text-caption text-muted-foreground">Rolled {{ lastRoll }}</p>
            <div class="mt-3 flex justify-center gap-2">
              <AppButton
                label="Mark as passed"
                size="sm"
                :variant="checkOutcome === 'passed' ? 'primary' : 'subtle'"
                :aria-pressed="checkOutcome === 'passed'"
                @click="checkOutcome = 'passed'"
              />
              <AppButton
                label="Mark as failed"
                size="sm"
                :variant="checkOutcome === 'failed' ? 'primary' : 'subtle'"
                :aria-pressed="checkOutcome === 'failed'"
                @click="checkOutcome = 'failed'"
              />
            </div>
            <p
              v-if="checkOutcome"
              class="mt-2 text-caption"
              :class="checkOutcome === 'passed' ? 'text-ink-success' : 'text-destructive'"
            >
              Marked {{ checkOutcome }} — noted for this table, not saved.
            </p>
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
        </template>

        <footer class="mt-4 flex justify-end gap-2">
          <AppButton v-if="encounterFocused" label="Encounter summary" variant="subtle" @click="encounterFocused = false" />
          <AppButton v-if="attachment.full_editor_to" :to="specialistUrl(attachment.full_editor_to)" label="Open full editor" variant="subtle" />
          <AppButton label="Back to beat" variant="primary" @click="emit('close')" />
        </footer>
      </section>
  </EntityLightbox>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onUnmounted, ref } from "vue";
import { useHotkeys } from "@/composables/useHotkeys";
import { useNpc } from "@/composables/npcs/useNpcs";
import { useFaction } from "@/composables/factions/useFactions";
import { useItems } from "@/composables/items/useItems";
import { useResolvedMonster } from "@/composables/monsters/useMonsters";
import { useNote } from "@/composables/notes/useNotes";
import { useScriptoriumDocument } from "@/composables/scriptorium/useScriptorium";
import { useSounds } from "@/composables/soundboard/useSounds";
import { usePlaylists, usePlaylistTracks } from "@/composables/soundboard/useSoundboardPlaylists";
import { useActionCheck, useBlockedCheck } from "@/composables/soundboard/useSoundPlayback";
import { useActiveAudioTriggers } from "@/composables/soundboard/useAudioThemeTriggers";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { QUEST_BEAT_ATTACHMENT_ADAPTERS } from "@/lib/quests/attachments";
import { withQuestReturnTo } from "@/lib/quests/navigation";
import { releaseAudioTheme, requestAudioCue } from "@/lib/audio/audioTriggers";
import type { QuestBeatAttachmentSummary, QuestCheckAttachmentMetadata } from "@/types/quest.types";
import type { Sound } from "@/types/sound.types";
import { IconDice } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import EntityLightbox from "@/components/common/EntityLightbox.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const EncounterRunSurface = defineAsyncComponent(() => import("@/components/encounters/EncounterRunSurface.vue"));

const props = defineProps<{ attachment: QuestBeatAttachmentSummary; returnTo: string; beatTitle: string }>();
const emit = defineEmits<{ close: [] }>();
const encounterFocused = ref(false);
const adapter = computed(() => QUEST_BEAT_ATTACHMENT_ADAPTERS[props.attachment.attachment_type]);
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
const { data: items } = useItems(() => ({ enabled: props.attachment.attachment_type === "item" }));
const item = computed(() => props.attachment.attachment_type === "item" ? items.value?.find((row) => row.id === props.attachment.ref_id) ?? null : null);
const portraitSrc = computed(() => npcRecord.value?.portrait_url ?? factionRecord.value?.emblem_url ?? item.value?.image_url ?? monster.value?.image_url ?? null);
const { data: sounds } = useSounds(() => props.attachment.attachment_type === "sound");
const isPlaylistAttachment = computed(() => props.attachment.attachment_type === "audio_scene" || props.attachment.attachment_type === "playlist");
const { data: playlists } = usePlaylists(() => isPlaylistAttachment.value);
const playlistId = computed(() => isPlaylistAttachment.value ? props.attachment.ref_id : null);
const { data: playlistTracksData } = usePlaylistTracks(playlistId);
const sound = computed(() => props.attachment.attachment_type === "sound" ? sounds.value?.find((row) => row.id === props.attachment.ref_id) ?? null : null);
const playlist = computed(() => isPlaylistAttachment.value ? playlists.value?.find((row) => row.id === props.attachment.ref_id) ?? null : null);
const playlistTracks = computed(() => playlistTracksData.value ?? []);

// A beat's audio cue goes through the trigger bus rather than the soundboard
// store directly (#870), so it takes the ambience slot through the same
// ownership model an encounter's theme or a location's ambience does — and so
// the "why is this playing" chip agrees with this button's own state.
const cueSourceId = computed(() => `beat:${props.attachment.beat_id}:${props.attachment.id}`);
const cueLabel = computed(() => `Beat · ${props.beatTitle}`);
const { triggerForPlaylist } = useActiveAudioTriggers();
const playlistActive = computed(() => {
  if (!playlist.value) return false;
  const trigger = triggerForPlaylist(playlist.value.id);
  return trigger !== null && trigger.sourceId === cueSourceId.value;
});
const playlistActionLabel = computed(() => {
  const noun = props.attachment.attachment_type === "audio_scene" ? "scene" : "playlist";
  return `${playlistActive.value ? "Stop" : "Play"} ${noun}`;
});
const actionFor = useActionCheck();
const blockedReason = useBlockedCheck();
const audioAction = (value: Sound) => ({ play: "Play cue", pause: "Pause cue", refire: "Fire cue again" })[actionFor(value)];
const specialistUrl = (path: string) => withQuestReturnTo(path, props.returnTo);
const checkMetadata = computed(() => props.attachment.metadata as unknown as QuestCheckAttachmentMetadata);
const { promptRoll } = usePromptedRoll();
const rolling = ref(false);
const lastRoll = ref<number | null>(null);
const checkOutcome = ref<"passed" | "failed" | null>(null);
async function rollCheck() {
  rolling.value = true;
  try {
    const result = await promptRoll({
      counts: { 20: 1 },
      modifier: 0,
      label: `${checkMetadata.value.skill} check`,
      senderName: "DM",
    });
    if (result) lastRoll.value = result.total;
  } finally {
    rolling.value = false;
  }
}
function toggleCuePlaylist() {
  if (!playlist.value) return;
  if (playlistActive.value) {
    releaseAudioTheme(cueSourceId.value);
  } else if (playlistTracks.value.length) {
    requestAudioCue({
      sourceId: cueSourceId.value,
      kind: "beat",
      label: cueLabel.value,
      slot: playlist.value.playlist_type,
      target: { playlistId: playlist.value.id },
    });
  }
}
function fireSoundCue() {
  if (!sound.value) return;
  // Always requests — useAudioThemeTriggers decides play/pause/refire from
  // the sound's real state, exactly as this button always has; this only adds
  // the ownership bookkeeping so the chip and the slot model can see it too.
  requestAudioCue({
    sourceId: cueSourceId.value,
    kind: "beat",
    label: cueLabel.value,
    slot: "ambient",
    target: { soundId: sound.value.id },
  });
}
// Leaving the cockpit gives the slot back — mirrors EncounterRunner, whose
// battle music would otherwise follow the DM around the app with nothing left
// on screen to stop it.
onUnmounted(() => releaseAudioTheme(cueSourceId.value));
useHotkeys([{ combo: "escape", description: "Close contained quest tool", handler: () => emit("close"), hidden: true }], { layer: "overlay" });
</script>
