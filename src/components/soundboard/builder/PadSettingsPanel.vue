<template>
  <section v-if="pad && kind" class="flex flex-col gap-4" aria-label="Pad settings">
    <header class="flex items-center justify-between gap-2">
      <h3 class="font-cinzel text-body text-gold-300 truncate">{{ shownName }}</h3>
      <AutosaveStatus :status="autosave.status.value" :error="autosave.saveError.value" />
    </header>

    <div class="space-y-1">
      <label class="text-label-lg text-muted-foreground" :for="nameId">Name</label>
      <AppInput :id="nameId" v-model="draft.name" tone="card" :placeholder="ownName" />
    </div>

    <div v-if="kind === 'sound'" class="space-y-1">
      <p class="text-label-lg text-muted-foreground">Takes</p>
      <PadTakesList
        :takes="takeRows"
        @preview="previewTake"
        @remove="(id) => removeTake(id)"
        @reorder="(ids) => reorderTakes({ padId: pad!.id, takeIds: ids })"
      />
      <p v-if="takeRows.length > 1" class="text-caption text-muted-foreground">
        Each press plays the next take in order.
      </p>
    </div>
    <AppButton
      v-else-if="playlist"
      variant="subtle"
      size="sm"
      :icon="IconEdit"
      :label="kind === 'scene' ? 'Edit scene' : 'Edit playlist'"
      @click="editorOpen = true"
    />

    <div class="space-y-3">
      <AppCheckbox v-model="draft.loop" label="Loop" />
      <div class="space-y-1">
        <p class="text-label-lg text-muted-foreground">Volume</p>
        <VolumeSlider v-model="draft.volume" wide show-percent />
      </div>
    </div>

    <template v-if="controls === 'full'">
      <div class="space-y-1 border-t border-border/50 pt-3">
        <p class="text-label-lg text-muted-foreground">A press</p>
        <SegmentedControl v-model="draft.mode" :options="MODES" block />
        <p class="text-caption text-muted-foreground">{{ LAUNCH_MODE_HINT[draft.mode] }}</p>
        <div v-if="draft.mode === 'repeat'" class="flex items-center gap-2 pt-1">
          <label class="text-label-lg text-muted-foreground" :for="repeatId">Repeat beat (ms)</label>
          <AppInput
            :id="repeatId"
            v-model.number="draft.repeatMs"
            type="number"
            tone="card"
            align="right"
            class="w-24"
            :block="false"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1">
          <label class="text-label-lg text-muted-foreground" :for="fadeInId">Fade in (seconds)</label>
          <AppInput :id="fadeInId" v-model="draft.fadeIn" type="number" tone="card" :placeholder="fadeDefault('in')" />
        </div>
        <div class="space-y-1">
          <label class="text-label-lg text-muted-foreground" :for="fadeOutId">Fade out (seconds)</label>
          <AppInput :id="fadeOutId" v-model="draft.fadeOut" type="number" tone="card" :placeholder="fadeDefault('out')" />
        </div>
      </div>

      <div class="space-y-2">
        <AppCheckbox
          v-if="kind === 'sound'"
          v-model="draft.vary"
          label="Change pitch and loudness a little on every hit"
          hint="Most useful with two or more takes, so a repeated sound does not machine-gun."
        />
        <AppCheckbox v-model="draft.velocity" label="Louder the harder you hit, on a controller that feels it" />
      </div>

      <div v-if="sound" class="space-y-2 border-t border-border/50 pt-3">
        <p class="text-label-lg text-muted-foreground">Sound</p>
        <SegmentedControl :model-value="sound.category" :options="CATEGORIES" block @update:model-value="setCategory" />
        <div class="relative flex min-h-9 items-center gap-2">
          <span class="text-caption text-muted-foreground">Loudness</span>
          <SoundTrimControl :sound="sound" />
        </div>
      </div>
    </template>

    <footer class="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
      <AppButton variant="ghost" tone="danger" size="sm" :icon="IconDelete" label="Take off the deck" @click="takeOff" />
      <AppButton variant="tinted" tone="primary" size="sm" label="Done" @click="done" />
    </footer>

    <PlaylistEditorDialog :open="editorOpen" :playlist="playlist" :page-id="null" @close="editorOpen = false" />
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from "vue";
import { IconDelete, IconEdit } from "@/lib/icons";
import { useDeckPads, useDeletePad, useRemoveTake, useReorderTakes, useUpdatePad } from "@/composables/soundboard/useDeckPads";
import { useSounds, useUpdateSound } from "@/composables/soundboard/useSounds";
import { usePlaylists } from "@/composables/soundboard/useSoundboardPlaylists";
import { useAudibleCheck, useSoundToggle } from "@/composables/soundboard/useSoundPlayback";
import { useAutosave } from "@/composables/useAutosave";
import { useConfirm } from "@/composables/useConfirm";
import { padCategory, padKind } from "@/lib/audio/deck/deckModel";
import type { DeckControls } from "@/lib/audio/deck/deckSurface";
import type { LaunchMode, SoundCategory } from "@/types/sound.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import PlaylistEditorDialog from "../PlaylistEditorDialog.vue";
import SoundTrimControl from "../SoundTrimControl.vue";
import VolumeSlider from "../VolumeSlider.vue";
import PadTakesList from "./PadTakesList.vue";
import { LAUNCH_MODE_HINT, draftFromPad, fadePlaceholder, padPatch, type PadDraft } from "./padSettingsModel";

// The page keys this panel by pad, so one instance edits one pad.
const { padId, controls } = defineProps<{ padId: string; controls: DeckControls }>();
const emit = defineEmits<{ close: [] }>();

const MODES: { value: LaunchMode; label: string }[] = [
  { value: "trigger", label: "Trigger" },
  { value: "toggle", label: "Toggle" },
  { value: "gate", label: "Gate" },
  { value: "repeat", label: "Repeat" },
];
const CATEGORIES: { value: SoundCategory; label: string }[] = [
  { value: "ambient", label: "Ambient" },
  { value: "music", label: "Music" },
  { value: "effects", label: "Effects" },
];

const uid = useId();
const editorOpen = ref(false);
const nameId = `${uid}-name`;
const repeatId = `${uid}-repeat`;
const fadeInId = `${uid}-fade-in`;
const fadeOutId = `${uid}-fade-out`;

const { data: pads } = useDeckPads();
const { data: sounds } = useSounds();
const { data: playlists } = usePlaylists();
const { mutateAsync: updatePad } = useUpdatePad();
const { mutateAsync: deletePad } = useDeletePad();
const { mutate: removeTake } = useRemoveTake();
const { mutate: reorderTakes } = useReorderTakes();
const { mutate: updateSound } = useUpdateSound();
const { confirm } = useConfirm();
const isAudible = useAudibleCheck();
const toggleSound = useSoundToggle();

const pad = computed(() => (pads.value ?? []).find((p) => p.id === padId) ?? null);
const soundsById = computed(() => new Map((sounds.value ?? []).map((s) => [s.id, s])));
const playlistsById = computed(() => new Map((playlists.value ?? []).map((pl) => [pl.id, pl])));
const playlist = computed(() => (pad.value?.playlist_id ? playlistsById.value.get(pad.value.playlist_id) ?? null : null));

const kind = computed(() => (pad.value ? padKind(pad.value, playlistsById.value) : null));
const firstSound = computed(() => {
  const take = pad.value?.takes[0];
  return take ? soundsById.value.get(take.sound_id) ?? null : null;
});
const category = computed(() => (kind.value ? padCategory(kind.value, firstSound.value?.category ?? null) : "effects"));
// The single sound a one-take pad is made of; a pad of several takes has no one sound to edit.
const sound = computed(() => (kind.value === "sound" && pad.value?.takes.length === 1 ? firstSound.value : null));

const ownName = computed(() => (kind.value === "sound" ? firstSound.value?.name : playlist.value?.name) ?? "Name");
const shownName = computed(() => (draft.name.trim() === "" ? ownName.value : draft.name.trim()));

const takeRows = computed(() =>
  (pad.value?.takes ?? []).map((take) => {
    const s = soundsById.value.get(take.sound_id);
    return { id: take.id, name: s ? s.name : "Missing sound", playing: s ? isAudible(s) : false };
  }),
);

function previewTake(takeId: string) {
  const take = pad.value?.takes.find((t) => t.id === takeId);
  const s = take ? soundsById.value.get(take.sound_id) : undefined;
  if (s) toggleSound(s);
}

function fadeDefault(which: "in" | "out"): string {
  return fadePlaceholder(category.value, which);
}

function setCategory(next: SoundCategory) {
  if (sound.value && next !== sound.value.category) updateSound({ id: sound.value.id, update: { category: next } });
}

// ── Autosave ──────────────────────────────────────────────────────────────

const draft = reactive<PadDraft>({
  name: "",
  loop: false,
  volume: 1,
  mode: "trigger",
  repeatMs: 500,
  fadeIn: "",
  fadeOut: "",
  vary: false,
  velocity: false,
});

let hydratedId: string | null = null;

const autosave = useAutosave<PadDraft>({
  draft,
  initial: () => (pad.value && kind.value ? draftFromPad(pad.value, category.value, kind.value) : { ...draft }),
  equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  delay: 600,
  save: async (snapshot) => {
    // Read the pad the draft was hydrated from, not whatever the cache holds now.
    const target = (pads.value ?? []).find((p) => p.id === hydratedId);
    if (!target) return;
    const targetKind = padKind(target, playlistsById.value);
    if (targetKind === null) return;
    const first = target.takes[0];
    const cat = padCategory(targetKind, first ? soundsById.value.get(first.sound_id)?.category ?? null : null);
    const patch = padPatch(snapshot, target, cat, targetKind);
    if (Object.keys(patch).length === 0) return;
    await updatePad({ id: target.id, patch });
  },
});

// Hydrate once the pad and what it points at are loaded; later cache refreshes must not clobber typing.
watch(
  () => (pad.value && kind.value ? pad.value.id : null),
  async (id) => {
    if (id === null || id === hydratedId) return;
    if (hydratedId !== null) await autosave.saveNow();
    hydratedId = id;
    autosave.reset();
  },
  { immediate: true },
);

async function done() {
  await autosave.saveNow();
  emit("close");
}

async function takeOff() {
  const ok = await confirm(`Take "${shownName.value}" off the deck? The sound stays in your library.`, {
    title: "Take off the deck",
    confirmLabel: "Take off",
  });
  if (!ok) return;
  // Stop autosave first so it cannot write to a row about to vanish.
  await autosave.hold();
  try {
    await deletePad(padId);
  } catch (error) {
    autosave.release();
    throw error;
  }
  emit("close");
}
</script>
