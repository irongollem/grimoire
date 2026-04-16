<template>
  <form
    class="rounded-lg border border-border bg-card p-4 space-y-4"
    @submit.prevent="handleSubmit"
  >
    <p class="font-cinzel text-sm font-semibold text-foreground">Add Sound</p>

    <!-- Name -->
    <div class="space-y-1">
      <label class="font-fell text-xs text-muted-foreground">Name</label>
      <input
        v-model="form.name"
        type="text"
        required
        placeholder="Tavern Ambience"
        class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-fell text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-gold-500"
      />
    </div>

    <!-- Category -->
    <div class="space-y-1">
      <label class="font-fell text-xs text-muted-foreground">Category</label>
      <select
        v-model="form.category"
        class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-gold-500"
      >
        <option value="ambient">Ambient</option>
        <option value="music">Music</option>
        <option value="effects">Effects</option>
        <option value="misc">Misc</option>
      </select>
    </div>

    <!-- Source type toggle -->
    <div class="space-y-2">
      <label class="font-fell text-xs text-muted-foreground">Audio Source</label>
      <div class="flex gap-2">
        <button
          type="button"
          class="flex-1 py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
          :class="
            form.source_type === 'url'
              ? 'bg-gold-500/20 border-gold-500/60 text-gold-300'
              : 'border-border text-muted-foreground hover:text-foreground'
          "
          @click="form.source_type = 'url'"
        >
          URL
        </button>
        <button
          type="button"
          class="flex-1 py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
          :class="
            form.source_type === 'upload'
              ? 'bg-gold-500/20 border-gold-500/60 text-gold-300'
              : 'border-border text-muted-foreground hover:text-foreground'
          "
          @click="form.source_type = 'upload'"
        >
          Upload File
        </button>
        <button
          v-if="spotifyStore.isEnabled"
          type="button"
          class="flex-1 py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
          :class="
            form.source_type === 'spotify'
              ? 'bg-green-500/20 border-green-500/60 text-green-400'
              : 'border-border text-muted-foreground hover:text-foreground'
          "
          @click="form.source_type = 'spotify'"
        >
          Spotify
        </button>
      </div>

      <!-- URL input -->
      <div v-if="form.source_type === 'url'" class="space-y-1">
        <input
          v-model="form.external_url"
          type="url"
          required
          placeholder="https://example.com/sound.mp3"
          class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-fell text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </div>

      <!-- Spotify URL input -->
      <div v-else-if="form.source_type === 'spotify'" class="space-y-1">
        <input
          v-model="form.external_url"
          type="url"
          required
          placeholder="https://open.spotify.com/track/… or /playlist/…"
          class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-fell text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
        <p v-if="form.external_url && !isValidSpotifyUrl" class="font-fell text-xs text-destructive">
          Paste a Spotify track, playlist, album, or episode URL.
        </p>
        <p v-else class="font-fell text-xs text-muted-foreground">
          Paste a track, playlist, album, or episode link from Spotify.
        </p>
      </div>

      <!-- File upload -->
      <div v-else class="space-y-1">
        <label
          class="flex flex-col items-center justify-center w-full h-20 rounded-md border border-dashed border-border bg-background cursor-pointer hover:border-gold-500/40 transition-colors"
        >
          <span v-if="!selectedFile" class="font-fell text-xs text-muted-foreground">
            Click to choose audio file
          </span>
          <span v-else class="font-fell text-xs text-foreground px-2 text-center truncate w-full">
            {{ selectedFile.name }}
          </span>
          <input
            type="file"
            accept="audio/mpeg,audio/ogg,audio/wav,audio/flac,audio/aac,audio/webm,audio/x-m4a,.mp3,.ogg,.wav,.flac,.aac,.webm,.m4a"
            class="sr-only"
            @change="handleFileChange"
          />
        </label>
        <p v-if="isBusy" class="font-fell text-xs text-muted-foreground text-center">{{ statusText }}</p>
        <p v-if="uploadError" class="font-fell text-xs text-destructive">{{ uploadError }}</p>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-2 justify-end pt-1">
      <button
        type="button"
        class="px-3 py-1.5 rounded-md border border-border text-xs font-cinzel text-muted-foreground hover:text-foreground transition-colors"
        @click="$emit('cancel')"
      >
        Cancel
      </button>
      <button
        type="submit"
        :disabled="isBusy || isPending || (form.source_type === 'spotify' && !isValidSpotifyUrl)"
        class="px-3 py-1.5 rounded-md bg-gold-500/20 border border-gold-500/40 text-xs font-cinzel text-gold-300 hover:bg-gold-500/30 transition-colors disabled:opacity-50"
      >
        {{ isPending ? "Saving…" : "Add Sound" }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useCreateSound, useSoundUpload } from "@/composables/useSounds";
import { useSpotifyStore } from "@/stores/spotify";
import type { SoundCategory, SoundSourceType } from "@/types/sound.types";

const spotifyStore = useSpotifyStore();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "saved"): void;
}>();

const { mutateAsync, isPending } = useCreateSound();
const { isBusy, statusText, upload } = useSoundUpload();

const form = ref<{
  name: string;
  category: SoundCategory;
  source_type: SoundSourceType;
  external_url: string;
}>({
  name: "",
  category: "ambient",
  source_type: "url",
  external_url: "",
});

const selectedFile = ref<File | null>(null);
const uploadError = ref("");

const MAX_FILE_SIZE_MB = 20;

const isValidSpotifyUrl = computed(() => {
  return /open\.spotify\.com\/(track|playlist|album|episode)\/[a-zA-Z0-9]+/.test(
    form.value.external_url,
  );
});

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  uploadError.value = "";

  if (file && file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    uploadError.value = `File too large — maximum ${MAX_FILE_SIZE_MB} MB.`;
    input.value = "";
    selectedFile.value = null;
    return;
  }

  selectedFile.value = file;
}

async function handleSubmit() {
  uploadError.value = "";

  if (form.value.source_type === "url") {
    await mutateAsync({
      name: form.value.name.trim(),
      category: form.value.category,
      source_type: "url",
      file_url: form.value.external_url.trim(),
      storage_path: null,
      tags: [],
      sort_order: 0,
    });
    emit("saved");
    resetForm();
    return;
  }

  if (form.value.source_type === "spotify") {
    await mutateAsync({
      name: form.value.name.trim(),
      category: form.value.category,
      source_type: "spotify",
      file_url: form.value.external_url.trim(),
      storage_path: null,
      tags: [],
      sort_order: 0,
    });
    emit("saved");
    resetForm();
    return;
  }

  // Upload flow
  if (!selectedFile.value) {
    uploadError.value = "Please select a file.";
    return;
  }

  const result = await upload(selectedFile.value);
  if (!result) {
    uploadError.value = "Upload failed. Please try again.";
    return;
  }

  await mutateAsync({
    name: form.value.name.trim(),
    category: form.value.category,
    source_type: "upload",
    file_url: result.file_url,
    storage_path: result.storage_path,
    tags: [],
    sort_order: 0,
  });
  emit("saved");
  resetForm();
}

function resetForm() {
  form.value = { name: "", category: "ambient", source_type: "url", external_url: "" };
  selectedFile.value = null;
  uploadError.value = "";
}
</script>
