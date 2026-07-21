<template>
  <Teleport to="body">
    <div
      v-if="isDraggingFile"
      class="fixed inset-0 z-300 flex items-center justify-center bg-gold-500/10 backdrop-blur-sm pointer-events-none"
    >
      <div class="rounded-2xl border-2 border-dashed border-gold-500 bg-card/90 px-8 py-6 shadow-2xl">
        <p class="font-cinzel text-base font-bold text-gold-300 tracking-wider">Drop audio to upload</p>
      </div>
    </div>
  </Teleport>

  <form
    class="space-y-4"
    @submit.prevent="handleSubmit"
  >
    <!-- Name -->
    <div v-if="activeSourceTab !== 'browse'" class="space-y-1">
      <label class="text-caption text-muted-foreground">Name</label>
      <input
        ref="nameInputRef"
        v-model="form.name"
        type="text"
        required
        placeholder="Tavern Ambience"
        class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-gold-500"
      />
    </div>

    <!-- Category -->
    <div v-if="activeSourceTab !== 'browse'" class="space-y-1">
      <label class="text-caption text-muted-foreground">Category</label>
      <select
        v-model="form.category"
        class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-gold-500"
      >
        <option value="ambient">Ambient</option>
        <option value="music">Music</option>
        <option value="effects">Effects</option>
        <option value="misc">Misc</option>
      </select>
    </div>

    <!-- Source type toggle -->
    <div class="space-y-2">
      <label class="text-caption text-muted-foreground">Audio Source</label>
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
          class="flex-1 py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors relative"
          :class="
            activeSourceTab === 'upload'
              ? 'bg-gold-500/20 border-gold-500/60 text-gold-300'
              : isPro
                ? 'border-border text-muted-foreground hover:text-foreground'
                : 'border-border text-muted-foreground/40 cursor-not-allowed'
          "
          :title="isPro ? undefined : 'Pro feature — upgrade to upload your own audio files'"
          @click="isPro ? onUploadTabClick() : undefined"
        >
          Upload
          <span v-if="!isPro" class="absolute -top-1.5 -right-1.5 px-1 rounded text-2xs font-cinzel bg-amber-500 text-black leading-4">PRO</span>
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
          v-if="geminiApiKey || campaignId"
          type="button"
          class="flex-1 py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors relative"
          :class="
            activeSourceTab === 'generate'
              ? 'bg-violet-500/20 border-violet-500/60 text-violet-300'
              : isPro
                ? 'border-border text-muted-foreground hover:text-foreground'
                : 'border-border text-muted-foreground/40 cursor-not-allowed'
          "
          :title="isPro ? undefined : 'Pro feature — upgrade to generate AI music'"
          @click="isPro ? (activeSourceTab = 'generate') : undefined"
        >
          Generate
          <span v-if="!isPro" class="absolute -top-1.5 -right-1.5 px-1 rounded text-2xs font-cinzel bg-amber-500 text-black leading-4">PRO</span>
        </button>
        <button
          type="button"
          class="flex-1 py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
          :class="
            activeSourceTab === 'browse'
              ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
              : 'border-border text-muted-foreground hover:text-foreground'
          "
          @click="activeSourceTab = 'browse'"
        >
          Browse SFX
        </button>
      </div>

      <!-- URL input -->
      <div v-if="activeSourceTab === 'url'" class="space-y-1">
        <input
          v-model="form.external_url"
          type="url"
          required
          placeholder="https://example.com/sound.mp3"
          class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </div>

      <!-- Spotify URL input -->
      <div v-else-if="activeSourceTab === 'spotify'" class="space-y-1">
        <input
          v-model="form.external_url"
          type="url"
          required
          placeholder="https://open.spotify.com/track/… or /playlist/…"
          class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
        <p v-if="form.external_url && !isValidSpotifyUrl" class="text-caption text-destructive">
          Paste a Spotify track, playlist, album, or episode URL.
        </p>
        <p v-else class="text-caption text-muted-foreground">
          Paste a track, playlist, album, or episode link from Spotify.
        </p>
      </div>

      <!-- AI Generate -->
      <div v-else-if="activeSourceTab === 'generate'" class="space-y-3">
        <!-- Style -->
        <div class="space-y-1">
          <label class="text-caption text-muted-foreground">Musical style</label>
          <textarea
            v-model="generatePrompt"
            rows="2"
            placeholder="e.g. epic fantasy ballad, orchestral strings, soaring female vocals, heroic"
            class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
          />
        </div>

        <!-- Lyrics -->
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <label class="text-caption text-muted-foreground">
              Lyrics <span class="opacity-60">(optional)</span>
            </label>
            <span
              class="text-caption-sm tabular-nums transition-colors"
              :class="lyricsCharsLeft < 200 ? (lyricsCharsLeft < 0 ? 'text-destructive' : 'text-amber-400') : 'text-muted-foreground'"
            >{{ generateLyrics.length }} / {{ LYRICS_MAX_CHARS }}</span>
          </div>
          <textarea
            v-model="generateLyrics"
            rows="5"
            :maxlength="LYRICS_MAX_CHARS"
            placeholder="[Verse 1]&#10;In the depths of shadow and stone…&#10;&#10;[Chorus]&#10;Rise, brave adventurer, rise…"
            class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
          />
          <p class="text-caption-sm text-muted-foreground/60">
            Best paired with Full Song. Use [Verse], [Chorus], [Bridge] markers.
          </p>
        </div>

        <!-- Model selector -->
        <div class="space-y-1">
          <label class="text-caption text-muted-foreground">Length</label>
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
              <span class="text-caption-sm opacity-70 normal-case tracking-normal">
                {{ geminiApiKey ? 'BYOK' : `${costOf(m.generationType)} cr` }} · {{ m.hint }}
              </span>
            </button>
          </div>
        </div>

        <!-- Structured prompt preview -->
        <details v-if="structuredPrompt" class="group">
          <summary class="text-caption-sm text-muted-foreground/60 cursor-pointer hover:text-muted-foreground transition-colors select-none">
            Expanded prompt ▸
          </summary>
          <p class="mt-1 text-caption-sm text-muted-foreground/80 whitespace-pre-wrap leading-relaxed">{{ structuredPrompt }}</p>
        </details>

        <!-- Status / error -->
        <p v-if="isStructuring" class="text-caption text-muted-foreground text-center">
          Expanding prompt…
        </p>
        <p v-else-if="isGenerating" class="text-caption text-muted-foreground text-center">
          Generating… this can take up to 30 s
        </p>
        <p v-if="isBusy && !isGenerating" class="text-caption text-muted-foreground text-center">
          {{ statusText }}
        </p>
        <p v-if="generateError" class="text-caption text-destructive">{{ generateError }}</p>
      </div>

      <!-- Browse Freesound -->
      <div v-else-if="activeSourceTab === 'browse'">
        <SoundFreesoundBrowser :page-id="pageId" @saved="$emit('saved')" />
      </div>

      <!-- File upload -->
      <div v-else class="space-y-1">
        <input
          ref="fileInputRef"
          type="file"
          accept="audio/mpeg,audio/ogg,audio/wav,audio/flac,audio/aac,audio/webm,audio/x-m4a,.mp3,.ogg,.wav,.flac,.aac,.webm,.m4a"
          class="sr-only"
          @change="handleFileChange"
        />
        <div
          v-if="selectedFile"
          class="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
        >
          <span class="flex-1 text-caption text-foreground truncate">{{ selectedFile.name }}</span>
          <button
            type="button"
            class="shrink-0 text-label text-muted-foreground hover:text-foreground transition-colors"
            @click="fileInputRef?.click()"
          >Change</button>
        </div>
        <p v-else class="text-caption text-muted-foreground italic text-center">
          Drop a file anywhere, or <button type="button" class="underline hover:text-foreground transition-colors" @click="fileInputRef?.click()">choose one</button>.
        </p>
        <p v-if="isBusy" class="text-caption text-muted-foreground text-center">{{ statusText }}</p>
        <p v-if="uploadError" class="text-caption text-destructive">{{ uploadError }}</p>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-2 justify-end pt-1">
      <button
        type="button"
        class="px-3 py-1.5 rounded-md border border-border text-xs font-cinzel text-muted-foreground hover:text-foreground transition-colors"
        @click="$emit('cancel')"
      >
        {{ activeSourceTab === "browse" ? "Done" : "Cancel" }}
      </button>
      <button
        v-if="activeSourceTab !== 'browse'"
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
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import { useCreateSound, useSoundUpload } from "@/composables/useSounds";
import { useSpotifyStore } from "@/stores/spotify";
import { useSubscription } from "@/composables/useSubscription";
import { generateMusicWithLyria, structureMusicPrompt, LYRIA_MODELS, LYRICS_MAX_CHARS, type LyriaModel } from "@/lib/aiMusic";
import { logUsage, useAiCredits } from "@/composables/useAiCredits";
import { supabase } from "@/lib/supabase";
import SoundFreesoundBrowser from "@/components/soundboard/SoundFreesoundBrowser.vue";
import type { SoundCategory } from "@/types/sound.types";

const spotifyStore = useSpotifyStore();
const { costOf } = useAiCredits();
const { isPro } = useSubscription();

const { pageId = null, geminiApiKey = null, campaignId = null } = defineProps<{
  pageId?: string | null;
  geminiApiKey?: string | null;
  campaignId?: string | null;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "saved"): void;
}>();

const { mutateAsync, isPending } = useCreateSound();
const { isBusy, statusText, upload } = useSoundUpload();

type SourceTab = "url" | "upload" | "spotify" | "generate" | "browse";

const activeSourceTab = ref<SourceTab>("url");

const form = ref<{ name: string; category: SoundCategory; external_url: string }>({
  name: "",
  category: "ambient",
  external_url: "",
});

// ── Upload tab ────────────────────────────────────────────────────────────

const selectedFile = ref<File | null>(null);
const uploadError = ref("");
const fileInputRef = ref<HTMLInputElement | null>(null);
const nameInputRef = ref<HTMLInputElement | null>(null);
const MAX_FILE_SIZE_MB = 20;

function applyFilenameToName(file: File) {
  if (form.value.name.trim()) return;
  form.value.name = file.name.replace(/\.[^.]+$/, "");
  nextTick(() => {
    nameInputRef.value?.focus();
    nameInputRef.value?.select();
  });
}

function setSelectedFile(file: File | null): boolean {
  uploadError.value = "";
  if (!file) {
    selectedFile.value = null;
    return false;
  }
  if (file.size === 0) {
    uploadError.value = "That file is empty (0 bytes). If it's stored in iCloud or another cloud sync, open it locally first so the contents download.";
    selectedFile.value = null;
    return false;
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    uploadError.value = `File too large — maximum ${MAX_FILE_SIZE_MB} MB.`;
    selectedFile.value = null;
    return false;
  }
  selectedFile.value = file;
  return true;
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  if (!setSelectedFile(file)) { input.value = ""; return; }
  if (file) applyFilenameToName(file);
}

async function onUploadTabClick() {
  const wasOnUpload = activeSourceTab.value === "upload";
  activeSourceTab.value = "upload";
  if (wasOnUpload || selectedFile.value) return;
  await nextTick();
  fileInputRef.value?.click();
}

// ── Drag-and-drop onto the dialog ─────────────────────────────────────────
// Any file dropped anywhere on the page while the form is mounted is treated
// as an upload — the dialog hijacks the whole window because no other drop
// target is meaningful here.
const isDraggingFile = ref(false);
let dragDepth = 0;

function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
}

function onWindowDragEnter(e: DragEvent) {
  if (!hasFiles(e)) return;
  dragDepth++;
  isDraggingFile.value = true;
}

function onWindowDragLeave() {
  if (dragDepth > 0) dragDepth--;
  if (dragDepth === 0) isDraggingFile.value = false;
}

function onWindowDragOver(e: DragEvent) {
  if (hasFiles(e)) e.preventDefault();
}

function onWindowDrop(e: DragEvent) {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  isDraggingFile.value = false;
  const file = e.dataTransfer?.files?.[0] ?? null;
  if (!file) return;
  activeSourceTab.value = "upload";
  if (setSelectedFile(file)) applyFilenameToName(file);
}

onMounted(() => {
  window.addEventListener("dragenter", onWindowDragEnter);
  window.addEventListener("dragleave", onWindowDragLeave);
  window.addEventListener("dragover", onWindowDragOver);
  window.addEventListener("drop", onWindowDrop);
});

onUnmounted(() => {
  window.removeEventListener("dragenter", onWindowDragEnter);
  window.removeEventListener("dragleave", onWindowDragLeave);
  window.removeEventListener("dragover", onWindowDragOver);
  window.removeEventListener("drop", onWindowDrop);
});

// ── Spotify tab ───────────────────────────────────────────────────────────

const isValidSpotifyUrl = computed(() =>
  /open\.spotify\.com\/(track|playlist|album|episode)\/[a-zA-Z0-9]+/.test(form.value.external_url),
);

// ── Generate tab ──────────────────────────────────────────────────────────

const generatePrompt = ref("");
const generateLyrics = ref("");
const generateModel = ref<LyriaModel>("lyria-3-clip-preview");
const isStructuring = ref(false);
const isGenerating = ref(false);
const generateError = ref("");
const structuredPrompt = ref("");

const lyricsCharsLeft = computed(() => LYRICS_MAX_CHARS - generateLyrics.value.length);

// ── Submit state ──────────────────────────────────────────────────────────

const anyBusy = computed(() => isBusy.value || isPending.value || isStructuring.value || isGenerating.value);

const submitDisabled = computed(() => {
  if (anyBusy.value) return true;
  if (activeSourceTab.value === "spotify") return !isValidSpotifyUrl.value;
  if (activeSourceTab.value === "generate") return !generatePrompt.value.trim();
  return false;
});

const submitLabel = computed(() => {
  if (isPending.value) return "Saving…";
  if (isStructuring.value) return "Expanding…";
  if (isGenerating.value) return "Generating…";
  if (isBusy.value) return statusText.value || "Uploading…";
  if (activeSourceTab.value === "generate") return "Generate & Add";
  return "Add Sound";
});

// ── Submit ────────────────────────────────────────────────────────────────

async function handleSubmit() {
  uploadError.value = "";
  generateError.value = "";

  // Browse tab has its own per-row add flow; nothing for the form to do.
  if (activeSourceTab.value === "browse") return;

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
      attribution: null,
      attribution_url: null,
      artist: null,
      thumbnail_url: null,
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
      attribution: null,
      attribution_url: null,
      artist: null,
      thumbnail_url: null,
    });
    emit("saved");
    resetForm();
    return;
  }

  if (activeSourceTab.value === "generate") {
    if (!geminiApiKey && !campaignId) return;

    // Step 1: expand the plain description into a structured Lyria prompt
    let finalPrompt = generatePrompt.value.trim();
    structuredPrompt.value = "";
    isStructuring.value = true;
    try {
      const { structured, textUsage } = await structureMusicPrompt(finalPrompt, generateModel.value, generateLyrics.value.trim() || undefined);
      structuredPrompt.value = structured;
      finalPrompt = structured;
      void textUsage; // internal step — not logged separately
    } catch {
      // Fall back to raw prompt if text provider unavailable
    } finally {
      isStructuring.value = false;
    }

    // Step 2: generate music with Lyria — client-side (local BYOK) or edge function
    isGenerating.value = true;
    let file: File;
    const isLocalMode = typeof localStorage !== "undefined" && localStorage.getItem("grimoire_key_local_mode") === "local";

    try {
      if (isLocalMode && geminiApiKey) {
        file = await generateMusicWithLyria(
          finalPrompt,
          generateModel.value,
          geminiApiKey,
          generateLyrics.value.trim() || undefined,
        );
        logUsage({ reason: "music_generation", imageUsage: { model: generateModel.value, provider: "google", image_count: 1 } });
      } else {
        if (!campaignId) throw new Error("No campaign or API key configured for music generation.");
        const { data, error } = await supabase.functions.invoke("generate-music", {
          body: {
            campaign_id: campaignId,
            style: finalPrompt,
            model: generateModel.value,
            lyrics: generateLyrics.value.trim() || undefined,
          },
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);

        const binary = atob(data.audio_base64 as string);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: (data.mime_type as string) ?? "audio/mpeg" });
        file = new File([blob], `ai-generated-${Date.now()}.mp3`, { type: "audio/mpeg" });
      }
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
      attribution: null,
      attribution_url: null,
      artist: "Grimoire AI",
      thumbnail_url: null,
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
    attribution: null,
    attribution_url: null,
    artist: null,
    thumbnail_url: null,
  });
  emit("saved");
  resetForm();
}

function resetForm() {
  form.value = { name: "", category: "ambient", external_url: "" };
  selectedFile.value = null;
  uploadError.value = "";
  generatePrompt.value = "";
  generateLyrics.value = "";
  generateError.value = "";
  structuredPrompt.value = "";
}
</script>
