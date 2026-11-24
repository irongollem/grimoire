<template>
  <Teleport to="body">
    <div
      v-if="isDraggingFile"
      class="fixed inset-0 z-300 flex items-center justify-center bg-gold-500/10 backdrop-blur-sm pointer-events-none"
    >
      <div class="rounded-2xl border-2 border-dashed border-gold-500 bg-card/90 px-8 py-6 shadow-2xl">
        <p class="text-heading-sm font-bold text-gold-300">Drop audio to upload</p>
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
      <AppInput
        ref="nameInputRef"
        v-model="form.name"
        type="text"
        required
        tone="default"
        size="body"
        placeholder="Tavern Ambience"
      />
    </div>

    <!-- Category -->
    <div v-if="activeSourceTab !== 'browse'" class="space-y-1">
      <label class="text-caption text-muted-foreground">Category</label>
      <AppSelect v-model="form.category" tone="default" size="body" weight="normal" block>
        <option value="ambient">Ambient</option>
        <option value="music">Music</option>
        <option value="effects">Effects</option>
      </AppSelect>
    </div>

    <!-- Source type toggle -->
    <div class="space-y-2">
      <label class="text-caption text-muted-foreground">Audio Source</label>
      <div class="flex gap-2 flex-wrap">
        <AppButton
          :variant="activeSourceTab === 'url' ? 'tinted' : 'subtle'"
          tone="primary"
          emphasis="strong"
          size="sm"
          label="URL"
          class="flex-1"
          @click="activeSourceTab = 'url'"
        />
        <AppButton
          :variant="activeSourceTab === 'upload' ? 'tinted' : 'subtle'"
          tone="primary"
          emphasis="strong"
          size="sm"
          :tooltip="isPro ? undefined : 'Pro feature: upgrade to upload your own audio files'"
          :class="[
            'flex-1',
            activeSourceTab !== 'upload' && !isPro ? 'text-muted-foreground/40 cursor-not-allowed' : '',
          ]"
          @click="isPro ? onUploadTabClick() : undefined"
        >
          Upload
          <ProBadge v-if="!isPro" />
        </AppButton>
        <AppButton
          v-if="spotifyStore.isEnabled"
          :variant="activeSourceTab === 'spotify' ? 'tinted' : 'subtle'"
          tone="success"
          emphasis="strong"
          size="sm"
          label="Spotify"
          class="flex-1"
          @click="activeSourceTab = 'spotify'"
        />
        <AppButton
          v-if="isAiEnabled && campaignId"
          variant="subtle"
          tone="arcane"
          emphasis="strong"
          size="sm"
          :icon="IconGenerate"
          label="Generate"
          class="flex-1"
          @click="openMusicCard"
        />
        <AppButton
          :variant="activeSourceTab === 'browse' ? 'tinted' : 'subtle'"
          tone="info"
          emphasis="strong"
          size="sm"
          class="flex-1"
          @click="activeSourceTab = 'browse'"
        >
          <!-- Not "Browse SFX" any more: this tab now leads with our own
               catalogue, which is free and quota-exempt, and a DM should be able
               to tell that from the label rather than by opening it. -->
          Library
        </AppButton>
      </div>

      <!-- URL input -->
      <div v-if="activeSourceTab === 'url'" class="space-y-1">
        <AppInput
          v-model="form.external_url"
          type="url"
          required
          tone="default"
          size="body"
          placeholder="https://example.com/sound.mp3"
        />
      </div>

      <!-- Spotify URL input -->
      <div v-else-if="activeSourceTab === 'spotify'" class="space-y-1">
        <AppInput
          v-model="form.external_url"
          type="url"
          required
          tone="default"
          size="body"
          placeholder="https://open.spotify.com/track/… or /playlist/…"
        />
        <p v-if="form.external_url && !isValidSpotifyUrl" class="text-caption text-destructive">
          Paste a Spotify track, playlist, album, or episode URL.
        </p>
        <div v-else class="flex items-center gap-1">
          <p class="text-caption text-muted-foreground">
            Paste a track, playlist, album, or episode link from Spotify.
          </p>
          <SpotifyLocalOnlyInfo />
        </div>
      </div>

      <!-- Browse Freesound -->
      <div v-else-if="activeSourceTab === 'browse'">
        <SoundProviderBrowser @saved="$emit('saved')" />
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
          class="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
        >
          <span class="flex-1 text-caption text-foreground truncate">{{ selectedFile.name }}</span>
          <AppButton variant="ghost" size="inline-xs" label="Change" class="shrink-0" @click="fileInputRef?.click()" />
        </div>
        <p v-else class="text-caption text-muted-foreground italic text-center">
          Drop a file anywhere, or <button type="button" class="underline hover:text-foreground transition-colors" @click="fileInputRef?.click()">choose one</button>.
        </p>
        <p v-if="isBusy" class="text-caption text-muted-foreground text-center">{{ statusText }}</p>
        <p v-if="uploadError" class="text-caption text-destructive">{{ uploadError }}</p>
      </div>

      <!-- url/spotify create failures — neither tab has a display element of
           its own; both reuse `uploadError`, same ref the upload tab already
           shows above. Kept outside the tab v-if/else-if chain so it doesn't
           break it. -->
      <p
        v-if="(activeSourceTab === 'url' || activeSourceTab === 'spotify') && uploadError"
        class="text-caption text-destructive"
      >{{ uploadError }}</p>
    </div>

    <!-- Actions -->
    <div class="flex gap-2 justify-end pt-1">
      <AppButton
        variant="subtle"
        size="sm"
        :label="activeSourceTab === 'browse' ? 'Done' : 'Cancel'"
        @click="$emit('cancel')"
      />
      <AppButton
        v-if="activeSourceTab !== 'browse'"
        type="submit"
        variant="tinted"
        tone="primary"
        emphasis="strong"
        size="sm"
        :label="submitLabel"
        :disabled="submitDisabled"
      />
    </div>
  </form>

  <PaywallModal v-model="showPaywall" resource="sounds" />
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconGenerate } from "@/lib/icons";
import ProBadge from "@/components/billing/ProBadge.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import type { AppInputHandle } from "@/components/common/controls/fieldVariants";
import { useCreateSound, useSoundUpload } from "@/composables/soundboard/useSounds";
import { useSpotifyStore } from "@/stores/spotify";
import { urlToUri } from "@/lib/audio/spotifyAuth";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useCampaignStore } from "@/stores/campaign";
import { useMusicGeneration } from "@/ai/useMusicGeneration";
import { useOpenGenerator } from "@/composables/ask/useOpenGenerator";
import SoundProviderBrowser from "@/components/soundboard/SoundProviderBrowser.vue";
import SpotifyLocalOnlyInfo from "@/components/soundboard/SpotifyLocalOnlyInfo.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { isQuotaExceeded } from "@/lib/quotaError";
import type { SoundCategory } from "@/types/sound.types";

const spotifyStore = useSpotifyStore();
const { isPro } = useSubscription();
// Upload (own audio, not AI) stays Pro-only; Generate reads the campaign's
// own AI Assistant toggle instead — the same gate generate-music enforces
// server-side.
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);

const { campaignId = null } = defineProps<{
  campaignId?: string | null;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "saved"): void;
}>();

const { mutateAsync, isPending } = useCreateSound();
const { isBusy, statusText, upload } = useSoundUpload();
const showPaywall = ref(false);

type SourceTab = "url" | "upload" | "spotify" | "browse";

// Generate is not a tab: the track's card is in the Familiar (#1270), so the button opens it and leaves the dialog.
const music = useMusicGeneration();
const { open: openGenerator } = useOpenGenerator();
function openMusicCard() {
  openGenerator("music_track");
  emit("cancel");
}

const activeSourceTab = ref<SourceTab>("url");

const form = ref<{ name: string; category: SoundCategory; external_url: string }>({
  name: "",
  category: "ambient",
  external_url: "",
});
// Tracks that finished while nothing was waiting on them (a reload mid-run)
// are applied here; the badge then says so, like any background generation.
async function recoverReadyMusicJobs(): Promise<void> {
  if (!campaignId) return;
  try {
    await music.recoverReadyJobs(campaignId);
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : "Could not recover completed music.";
  }
}

onMounted(() => {
  void recoverReadyMusicJobs();
});

// ── Upload tab ────────────────────────────────────────────────────────────

const selectedFile = ref<File | null>(null);
const uploadError = ref("");
const fileInputRef = ref<HTMLInputElement | null>(null);
const nameInputRef = ref<AppInputHandle | null>(null);
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
    uploadError.value = `File too large. Maximum ${MAX_FILE_SIZE_MB} MB.`;
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

const isValidSpotifyUrl = computed(() => urlToUri(form.value.external_url) !== null);

// ── Submit state ──────────────────────────────────────────────────────────

const anyBusy = computed(() => isBusy.value || isPending.value);

const submitDisabled = computed(() => {
  if (anyBusy.value) return true;
  if (activeSourceTab.value === "spotify") return !isValidSpotifyUrl.value;
  return false;
});

const submitLabel = computed(() => {
  if (isPending.value) return "Saving…";
  if (isBusy.value) return statusText.value || "Uploading…";
  return "Add Sound";
});

// ── Submit ────────────────────────────────────────────────────────────────

async function handleSubmit() {
  uploadError.value = "";

  // Browse tab has its own per-row add flow; nothing for the form to do.
  if (activeSourceTab.value === "browse") return;

  // Wraps every branch below: none of the three `mutateAsync` create calls
  // (url, spotify, plain upload) had a catch of
  // their own, so a quota rejection — or any other failure — on the actual
  // create wrote nothing to the screen at all, not even the per-branch
  // `uploadError` the upload branch already shows for its own step.
  try {
  if (activeSourceTab.value === "url") {
    await mutateAsync({
      name: form.value.name.trim(),
      category: form.value.category,
      source_type: "url",
      file_url: form.value.external_url.trim(),
      storage_path: null,
      tags: [],
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
      tags: [],
      attribution: null,
      attribution_url: null,
      artist: null,
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
    tags: [],
    attribution: null,
    attribution_url: null,
    artist: null,
    thumbnail_url: null,
  });
  emit("saved");
  resetForm();
  } catch (e) {
    if (isQuotaExceeded(e)) { showPaywall.value = true; return; }
    const msg = e instanceof Error ? e.message : "Something went wrong";
    uploadError.value = msg;
  }
}

function resetForm() {
  form.value = { name: "", category: "ambient", external_url: "" };
  selectedFile.value = null;
  uploadError.value = "";
}
</script>
