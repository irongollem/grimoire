<template>
  <AppModal :open="sound !== null" size="md" @close="done">
    <ModalHeader title="Edit sound" :icon="IconMusic" tone="gold" closeable @close="done">
      <template #actions>
        <AutosaveStatus :status="autosave.status.value" :error="autosave.saveError.value" />
      </template>
    </ModalHeader>

    <div v-if="sound" class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
      <div class="flex gap-4">
        <!-- Artwork is what the lock screen and CarPlay show while it plays.
             Spotify brings its own, so it has none to set here. -->
        <div v-if="sound.source_type !== 'spotify'" class="w-24 shrink-0">
          <ImageUpload
            bucket="sound-images"
            aspect="square"
            placeholder="Artwork"
            :model-value="sound.thumbnail_url"
            @update:model-value="setArtwork"
          />
        </div>
        <div class="min-w-0 flex-1 space-y-3">
          <div class="space-y-1">
            <label class="text-label-lg text-muted-foreground" :for="nameId">Name</label>
            <AppInput :id="nameId" v-model="draft.name" tone="card" maxlength="120" />
            <p v-if="draft.name.trim() === ''" class="text-caption text-destructive">A sound needs a name.</p>
          </div>
          <div class="space-y-1">
            <label class="text-label-lg text-muted-foreground" :for="artistId">Artist</label>
            <AppInput :id="artistId" v-model="draft.artist" tone="card" placeholder="Shown on the lock screen" maxlength="120" />
          </div>
        </div>
      </div>

      <div class="space-y-1">
        <p class="text-label-lg text-muted-foreground">Kind</p>
        <SegmentedControl v-model="draft.category" :options="SOUND_KIND_OPTIONS" block />
        <p class="text-caption text-muted-foreground">{{ SOUND_KIND_HINT[draft.category] }}</p>
      </div>

      <div class="relative flex min-h-9 items-center gap-2">
        <span class="text-caption text-muted-foreground">Loudness</span>
        <SoundTrimControl :sound="sound" />
      </div>

      <p v-if="sound.attribution" class="text-caption text-muted-foreground">{{ sound.attribution }}</p>
    </div>

    <div class="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-3">
      <AppButton variant="ghost" tone="danger" size="sm" :icon="IconDelete" label="Delete sound" @click="remove" />
      <AppButton variant="tinted" tone="primary" size="sm" label="Done" @click="done" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { reactive, useId, watch } from "vue";
import { IconDelete, IconMusic } from "@/lib/icons";
import { useDeleteSound, useUpdateSound } from "@/composables/soundboard/useSounds";
import { useAutosave } from "@/composables/useAutosave";
import { useConfirm } from "@/composables/useConfirm";
import { useSoundboardStore } from "@/stores/soundboard";
import { SOUND_KIND_HINT, SOUND_KIND_OPTIONS } from "@/lib/audio/soundKinds";
import type { Sound, SoundCategory } from "@/types/sound.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import ImageUpload from "@/components/common/media/ImageUpload.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import SoundTrimControl from "./SoundTrimControl.vue";

// The sound being edited, or null when closed. The parent passes the live
// cache row, so artwork and trim (written straight through) show at once.
const { sound } = defineProps<{ sound: Sound | null }>();
const emit = defineEmits<{ close: [] }>();

interface SoundDraft {
  name: string;
  artist: string;
  category: SoundCategory;
}

const uid = useId();
const nameId = `${uid}-name`;
const artistId = `${uid}-artist`;

const { mutateAsync: updateSound } = useUpdateSound();
const { mutateAsync: deleteSound } = useDeleteSound();
const { confirm } = useConfirm();
const store = useSoundboardStore();

const draft = reactive<SoundDraft>({ name: "", artist: "", category: "effects" });
let hydrated: Sound | null = null;

function draftOf(s: Sound | null): SoundDraft {
  return s === null ? { ...draft } : { name: s.name, artist: s.artist ?? "", category: s.category };
}

const autosave = useAutosave<SoundDraft>({
  draft,
  initial: () => draftOf(hydrated),
  equal: (a, b) => a.name === b.name && a.artist === b.artist && a.category === b.category,
  canSave: () => draft.name.trim() !== "",
  delay: 600,
  save: async (snapshot) => {
    // The sound the draft was hydrated from, not whichever is open now.
    const target = hydrated;
    if (target === null) return;
    const artist = snapshot.artist.trim();
    await updateSound({
      id: target.id,
      update: { name: snapshot.name.trim(), artist: artist === "" ? null : artist, category: snapshot.category },
    });
  },
});

// Hydrate when a different sound opens; a cache refresh of the same one must not clobber typing.
watch(
  () => sound?.id ?? null,
  async (id) => {
    if (id === (hydrated?.id ?? null)) return;
    if (hydrated !== null) await autosave.saveNow();
    hydrated = sound;
    autosave.reset();
  },
  { immediate: true },
);

function setArtwork(url: string | null) {
  if (sound) void updateSound({ id: sound.id, update: { thumbnail_url: url } });
}

async function done() {
  await autosave.saveNow();
  hydrated = null;
  emit("close");
}

async function remove() {
  const target = sound;
  if (target === null) return;
  const ok = await confirm(
    `Delete "${target.name}"? It also comes off every pad, scene and playlist it is on.`,
    { title: "Delete sound", confirmLabel: "Delete" },
  );
  if (!ok) return;
  await autosave.hold();
  try {
    store.stop(target.id);
    await deleteSound(target);
  } catch (error) {
    autosave.release();
    throw error;
  }
  hydrated = null;
  autosave.release();
  emit("close");
}
</script>
