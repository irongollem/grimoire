<template>
  <form
    class="space-y-4"
    @submit.prevent="handleSubmit"
  >
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
      <div class="flex gap-2 flex-wrap">
        <button
          type="button"
          class="flex-1 py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
          :class="
            activeSourceTab === 'url'
              ? 'bg-gold-500/20 border-gold-500/60 text-gold-300'
              : 'border-border text-muted-foreground hover:text-foreground'
          "
          @click="activeSourceTab = 'url'"
        >
          URL
        </button>
        <button
          type="button"
          class="flex-1 py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
          :class="
            activeSourceTab === 'upload'
              ? 'bg-gold-500/20 border-gold-500/60 text-gold-300'
              : 'border-border text-muted-foreground hover:text-foreground'
          "
          @click="activeSourceTab = 'upload'"
        >
          Upload
        </button>
        <button
          v-if="spotifyStore.isEnabled"
          type="button"
          class="flex-1 py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
          :class="
            activeSourceTab === 'spotify'
              ? 'bg-green-500/20 border-green-500/60 text-green-400'
              : 'border-border text-muted-foreground hover:text-foreground'
          "
          @click="activeSourceTab = 'spotify'"
        >
          Spotify
        </button>
        <button
          v-if="geminiApiKey"
          type="button"
          class="flex-1 py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
          :class="
            activeSourceTab === 'generate'
              ? 'bg-violet-500/20 border-violet-500/60 text-violet-300'
              : 'border-border text-muted-foreground hover:text-foreground'
          "
          @click="activeSourceTab = 'generate'"
        >
          Generate
        </button>
      </div>

      <!-- URL input -->
      <div v-if="activeSourceTab === 'url'" class="space-y-1">
        <input
          v-model="form.external_url"
          type="url"
          required
          placeholder="https://example.com/sound.mp3"
          class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-fell text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </div>

      <!-- Spotify URL input -->
      <div v-else-if="activeSourceTab === 'spotify'" class="space-y-1">
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

      <!-- AI Generate -->
      <div v-else-if="activeSourceTab === 'generate'" class="space-y-3">
        <!-- Prompt -->
        <div class="space-y-1">
          <label class="font-fell text-xs text-muted-foreground">Describe the music</label>
          <textarea
            v-model="generatePrompt"
            rows="3"
            placeholder="e.g. tense dungeon combat music with drums and strings, dark and cinematic"
            class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-fell text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
          />
        </div>

        <!-- Model selector -->
        <div class="space-y-1">
          <label class="font-fell text-xs text-muted-foreground">Length</label>
          <div class="flex gap-2">
            <button
              v-for="m in LYRIA_MODELS"
              :key="m.id"
              type="button"
              class="flex-1 flex flex-col items-center py-1.5 px-2 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
              :class="
                generateModel === m.id
                  ? 'bg-violet-500/20 border-violet-500/60 text-violet-300'
                  : 'border-border text-muted-foreground hover:text-foreground'
              "
              @click="generateModel = m.id"
            >
              <span>{{ m.label }}</span>
              <span class="font-fell text-[10px] opacity-70 normal-case tracking-normal">{{ m.detail }}</span>
            </button>
          </div>
        </div>

        <!-- Status / error -->
        <p v-if="isGenerating" class="font-fell text-xs text-muted-foreground text-center">
          Generating… this can take up to 30 s
        </p>
        <p v-if="isBusy && !isGenerating" class="font-fell text-xs text-muted-foreground text-center">
          {{ statusText }}
        </p>
        <p v-if="generateError" class="font-fell text-xs text-destructive">{{ generateError }}</p>
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
        :disabled="submitDisabled"
        class="px-3 py-1.5 rounded-md border text-xs font-cinzel transition-colors disabled:opacity-50"
        :class="
          activeSourceTab === 'generate'
            ? 'bg-violet-500/20 border-violet-500/40 text-violet-300 hover:bg-violet-500/30'
            : 'bg-gold-500/20 border-gold-500/40 text-gold-300 hover:bg-gold-500/30'
        "
      >
        {{ submitLabel }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useCreateSound, useSoundUpload } from "@/composables/useSounds";
import { useSpotifyStore } from "@/stores/spotify";
import { generateMusicWithLyria, LYRIA_MODELS, type LyriaModel } from "@/lib/aiMusic";
import { logUsage } from "@/composables/useAiCredits";
import type { SoundCategory } from "@/types/sound.types";

const spotifyStore = useSpotifyStore();

const { pageId = null, geminiApiKey = null } = defineProps<{
  pageId?: string | null;
  geminiApiKey?: string | null;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "saved"): void;
}>();

const { mutateAsync, isPending } = useCreateSound();
const { isBusy, statusText, upload } = useSoundUpload();

type SourceTab = "url" | "upload" | "spotify" | "generate";

const activeSourceTab = ref<SourceTab>("url");

const form = ref<{ name: string; category: SoundCategory; external_url: string }>({
  name: "",
  category: "ambient",
  external_url: "",
});

// ── Upload tab ────────────────────────────────────────────────────────────

const selectedFile = ref<File | null>(null);
const uploadError = ref("");
const MAX_FILE_SIZE_MB = 20;

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

// ── Spotify tab ───────────────────────────────────────────────────────────

const isValidSpotifyUrl = computed(() =>
  /open\.spotify\.com\/(track|playlist|album|episode)\/[a-zA-Z0-9]+/.test(form.value.external_url),
);

// ── Generate tab ──────────────────────────────────────────────────────────

const generatePrompt = ref("");
const generateModel = ref<LyriaModel>("lyria-3-clip-preview");
const isGenerating = ref(false);
const generateError = ref("");

// ── Submit state ──────────────────────────────────────────────────────────

const anyBusy = computed(() => isBusy.value || isPending.value || isGenerating.value);

const submitDisabled = computed(() => {
  if (anyBusy.value) return true;
  if (activeSourceTab.value === "spotify") return !isValidSpotifyUrl.value;
  if (activeSourceTab.value === "generate") return !generatePrompt.value.trim();
  return false;
});

const submitLabel = computed(() => {
  if (isPending.value) return "Saving…";
  if (isGenerating.value) return "Generating…";
  if (isBusy.value) return statusText.value || "Uploading…";
  if (activeSourceTab.value === "generate") return "Generate & Add";
  return "Add Sound";
});

// ── Submit ────────────────────────────────────────────────────────────────

async function handleSubmit() {
  uploadError.value = "";
  generateError.value = "";

  if (activeSourceTab.value === "url") {
    await mutateAsync({
      name: form.value.name.trim(),
      category: form.value.category,
      source_type: "url",
      file_url: form.value.external_url.trim(),
      storage_path: null,
      page_id: pageId ?? null,
      tags: [],
      sort_order: 0,
    });
    emit("saved");
    resetForm();
    return;
  }

  if (activeSourceTab.value === "spotify") {
    await mutateAsync({
      name: form.value.name.trim(),
      category: form.value.category,
      source_type: "spotify",
      file_url: form.value.external_url.trim(),
      storage_path: null,
      page_id: pageId ?? null,
      tags: [],
      sort_order: 0,
    });
    emit("saved");
    resetForm();
    return;
  }

  if (activeSourceTab.value === "generate") {
    if (!geminiApiKey) return;
    isGenerating.value = true;
    let file: File;
    try {
      file = await generateMusicWithLyria(generatePrompt.value.trim(), generateModel.value, geminiApiKey);
      logUsage({ reason: "music_generation", imageUsage: { model: generateModel.value, provider: "google", image_count: 1 } });
    } catch (err) {
      generateError.value = err instanceof Error ? err.message : "Generation failed.";
      return;
    } finally {
      isGenerating.value = false;
    }

    const result = await upload(file);
    if (!result) {
      generateError.value = "Upload failed. Please try again.";
      return;
    }
    await mutateAsync({
      name: form.value.name.trim() || generatePrompt.value.trim().slice(0, 60),
      category: form.value.category,
      source_type: "upload",
      file_url: result.file_url,
      storage_path: result.storage_path,
      page_id: pageId ?? null,
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
    page_id: pageId ?? null,
    tags: [],
    sort_order: 0,
  });
  emit("saved");
  resetForm();
}

function resetForm() {
  form.value = { name: "", category: "ambient", external_url: "" };
  selectedFile.value = null;
  uploadError.value = "";
  generatePrompt.value = "";
  generateError.value = "";
}
</script>
