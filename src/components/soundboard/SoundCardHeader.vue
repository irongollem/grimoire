<template>
  <!-- flex-wrap so the wide conditional badges ("No Safari" / "Retry") wrap
       instead of overflowing a narrow card's right edge (#464). Normal cards
       fit on one line and are visually unchanged. -->
  <div class="flex flex-wrap items-start gap-2 min-w-0">
    <!-- Thumbnail (click to upload / replace) -->
    <button
      v-if="!isSpotify"
      type="button"
      class="relative shrink-0 w-8 h-8 rounded overflow-hidden border border-border bg-border/30 flex items-center justify-center group/thumb transition-colors hover:border-gold-500/40"
      :title="sound.thumbnail_url ? 'Replace artwork' : 'Add artwork'"
      :disabled="isUploadingThumb"
      @click="thumbInputRef?.click()"
    >
      <FocalImage
        v-if="sound.thumbnail_url"
        :src="sound.thumbnail_url"
        format="square"
        alt=""
      />
      <IconImage v-else class="h-3.5 w-3.5 text-muted-foreground/40 group-hover/thumb:text-muted-foreground transition-colors" />
      <!-- Uploading spinner -->
      <div v-if="isUploadingThumb" class="absolute inset-0 flex items-center justify-center bg-background/70">
        <div class="w-3 h-3 rounded-full border border-gold-500/60 border-t-transparent animate-spin" />
      </div>
    </button>
    <input
      ref="thumbInputRef"
      type="file"
      accept="image/*"
      class="sr-only"
      @change="handleThumbChange"
    />

    <!-- Inline label + artist edit -->
    <div class="flex-1 min-w-0">
      <!-- The name itself is not repeated here: the pad above already carries
           it as the card's title. This input only surfaces while renaming, in
           the same spot the "Rename" button below opens it. -->
      <AppInput
        v-if="editingName"
        ref="nameInput"
        v-model="nameDraft"
        tone="underline"
        size="lg"
        class="font-semibold"
        @keydown.enter="saveName"
        @keydown.escape="cancelNameEdit"
        @blur="saveName"
      />

      <!-- Artist (inline editable; shows placeholder on hover when empty) -->
      <AppInput
        v-if="editingArtist"
        ref="artistInput"
        v-model="artistDraft"
        tone="underline"
        size="caption"
        placeholder="Artist name…"
        @keydown.enter="saveArtist"
        @keydown.escape="cancelArtistEdit"
        @blur="saveArtist"
      />
      <p
        v-else
        class="text-caption truncate cursor-pointer"
        :class="sound.artist
          ? 'text-muted-foreground italic'
          : 'italic text-muted-foreground/40 [@media(hover:hover)]:text-muted-foreground/0 [@media(hover:hover)]:group-hover:text-muted-foreground/40'"
        :title="sound.artist ? 'Edit artist' : 'Add artist'"
        @click="startArtistEdit"
      >{{ sound.artist || 'Add artist…' }}</p>

      <!-- Category (inline editable; click to change type) -->
      <AppSelect
        v-if="editingCategory"
        ref="categoryInput"
        :model-value="sound.category"
        tone="underline"
        size="caption"
        weight="normal"
        class="capitalize"
        @update:model-value="saveCategory($event)"
        @blur="editingCategory = false"
      >
        <option value="ambient">Ambient</option>
        <option value="music">Music</option>
        <option value="effects">Effects</option>
        <option value="misc">Misc</option>
      </AppSelect>
      <p
        v-else
        class="text-caption-sm text-muted-foreground/60 italic capitalize cursor-pointer hover:text-muted-foreground"
        title="Change category"
        @click="startCategoryEdit"
      >{{ sound.category }}</p>

      <!-- Loudness trim (audio only — Spotify's own gain isn't ours to touch) -->
      <SoundTrimControl v-if="!isSpotify" :sound="sound" />
    </div>

    <!-- Edit name button -->
    <AppButton
      v-if="!editingName"
      variant="ghost"
      size="icon-xs"
      class="shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
      tooltip="Rename"
      :icon="IconEdit"
      icon-size="xs"
      @click="startNameEdit"
    />

    <!-- WebM warning -->
    <span
      v-if="isWebM"
      class="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-cinzel text-amber-400/80 bg-amber-500/10 border border-amber-500/20"
      title="Encoded as WebM/Opus — won't play in Safari. Re-upload on Firefox."
    >
      <IconWarning class="h-2.5 w-2.5 shrink-0" />
      No Safari
    </span>

    <!-- Source unavailable (e.g. Freesound 502 after retry) -->
    <AppButton
      v-if="audioState.loadError"
      variant="tinted"
      tone="caution"
      emphasis="soft"
      size="xs"
      class="shrink-0"
      label="Retry"
      tooltip="Source failed to load — click to retry"
      @click.stop="soundboardStore.retryLoad(sound.id, sound.file_url)"
    >
      <template #icon><IconWarning class="h-2.5 w-2.5 shrink-0" /></template>
    </AppButton>

    <!-- Loop toggle (audio only) -->
    <AppButton
      v-if="!isSpotify"
      variant="ghost"
      size="icon-xs"
      class="shrink-0"
      :active="audioState.isLooping"
      :icon="IconRepeat"
      tooltip="Toggle loop"
      @click="soundboardStore.toggleLoop(sound.id)"
    />

    <!-- Delete button -->
    <AppButton
      v-if="showDelete"
      variant="ghost"
      tone="danger"
      size="icon-xs"
      class="shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
      :icon="IconDelete"
      tooltip="Delete sound"
      @click="$emit('delete', sound)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { IconDelete, IconEdit, IconImage, IconRepeat, IconWarning } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import type { AppInputHandle, AppSelectHandle } from "@/components/common/fieldVariants";
import FocalImage from "@/components/common/FocalImage.vue";
import SoundTrimControl from "./SoundTrimControl.vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useUpdateSound, useSoundThumbnailUpload } from "@/composables/soundboard/useSounds";
import type { Sound, SoundCategory } from "@/types/sound.types";

const { sound, showDelete } = defineProps<{
  sound: Sound;
  showDelete?: boolean;
}>();

defineEmits<{
  (e: "delete", sound: Sound): void;
}>();

const soundboardStore = useSoundboardStore();
const { mutate: updateSound } = useUpdateSound();

const isSpotify = computed(() => sound.source_type === "spotify");
const audioState = computed(() => soundboardStore.getState(sound.id));

const isWebM = computed(() => {
  const path = (sound.storage_path ?? sound.file_url).split("?")[0];
  return path.endsWith(".webm");
});

// ── Thumbnail upload ───────────────────────────────────────────────────────

const thumbInputRef = ref<HTMLInputElement | null>(null);
const { isUploading: isUploadingThumb, upload: uploadThumb, remove: removeThumb } = useSoundThumbnailUpload();

async function handleThumbChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  (e.target as HTMLInputElement).value = ""; // reset so same file can be re-selected
  // Remove old thumbnail from storage before uploading the new one
  if (sound.thumbnail_url) {
    await removeThumb(sound.thumbnail_url);
  }
  const url = await uploadThumb(file);
  if (url) {
    updateSound({ id: sound.id, update: { thumbnail_url: url } });
  }
}

// ── Inline name editing ───────────────────────────────────────────────────

const editingName = ref(false);
const nameInput = ref<AppInputHandle | null>(null);
const nameDraft = ref("");

function startNameEdit() {
  nameDraft.value = sound.name;
  editingName.value = true;
  nextTick(() => nameInput.value?.select());
}

function saveName() {
  const trimmed = nameDraft.value.trim();
  if (trimmed && trimmed !== sound.name) {
    updateSound({ id: sound.id, update: { name: trimmed } });
  }
  editingName.value = false;
}

function cancelNameEdit() {
  editingName.value = false;
}

// ── Inline artist editing ─────────────────────────────────────────────────

const editingArtist = ref(false);
const artistInput = ref<AppInputHandle | null>(null);
const artistDraft = ref("");

function startArtistEdit() {
  artistDraft.value = sound.artist ?? "";
  editingArtist.value = true;
  nextTick(() => artistInput.value?.select());
}

function saveArtist() {
  const trimmed = artistDraft.value.trim();
  const current = sound.artist ?? "";
  if (trimmed !== current) {
    updateSound({ id: sound.id, update: { artist: trimmed || null } });
  }
  editingArtist.value = false;
}

function cancelArtistEdit() {
  editingArtist.value = false;
}

// ── Inline category editing ───────────────────────────────────────────────

const editingCategory = ref(false);
const categoryInput = ref<AppSelectHandle | null>(null);

function startCategoryEdit() {
  editingCategory.value = true;
  nextTick(() => categoryInput.value?.focus());
}

function saveCategory(value: string) {
  if (value && value !== sound.category) {
    updateSound({ id: sound.id, update: { category: value as SoundCategory } });
  }
  editingCategory.value = false;
}
</script>
