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
        <option value="misc">Misc</option>
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
          v-if="isAiEnabled && (geminiApiKey || campaignId)"
          :variant="activeSourceTab === 'generate' ? 'tinted' : 'subtle'"
          tone="arcane"
          emphasis="strong"
          size="sm"
          :icon="IconGenerate"
          label="Generate"
          class="flex-1"
          @click="activeSourceTab = 'generate'"
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
        <p v-else class="text-caption text-muted-foreground">
          Paste a track, playlist, album, or episode link from Spotify.
        </p>
      </div>

      <!-- AI Generate -->
      <div v-else-if="activeSourceTab === 'generate'" class="space-y-3">
        <!-- Description -->
        <div class="space-y-1">
          <label class="text-caption text-muted-foreground">Description</label>
          <MentionTextarea
            v-model="generateDescription"
            :rows="2"
            placeholder="e.g. the passage-grove at night, @Vesper waiting, soft and serene"
            :items="mentionItems"
            input-class="rounded-md border border-border bg-background px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-tone-arcane resize-none"
          />
          <p v-if="mentionedWithImages.length > 0" class="text-caption-sm text-muted-foreground/60">
            Lyria will read {{ mentionedWithImages.length }} {{ mentionedWithImages.length === 1 ? 'picture' : 'pictures' }}: {{ mentionedWithImages.join(', ') }}
          </p>
        </div>

        <!-- Length -->
        <div class="space-y-1">
          <label class="text-caption text-muted-foreground">Length</label>
          <SegmentedControl
            v-model="generateLengthSeconds"
            :options="MUSIC_LENGTH_OPTIONS"
            size="sm"
            wrap
          />
        </div>

        <!-- Vocals -->
        <div class="space-y-1">
          <label class="text-caption text-muted-foreground">Vocals</label>
          <SegmentedControl
            v-model="generateVocals"
            :options="VOCALS_OPTIONS"
            size="sm"
            wrap
          />
        </div>

        <!-- Cost -->
        <GenerationCostBadge :credits="musicCost" :byok="!!geminiApiKey" />

        <!-- Lyrics — only meaningful once the track will actually sing. -->
        <div v-if="generateVocals === 'vocals'" class="space-y-1">
          <div class="flex items-center justify-between">
            <label class="text-caption text-muted-foreground">
              Lyrics <span class="opacity-60">(optional)</span>
            </label>
            <span
              class="text-caption-sm tabular-nums transition-colors"
              :class="lyricsCharsLeft < 200 ? (lyricsCharsLeft < 0 ? 'text-destructive' : 'text-ink-caution') : 'text-muted-foreground'"
            >{{ generateLyrics.length }} / {{ LYRICS_MAX_CHARS }}</span>
          </div>
          <textarea
            v-model="generateLyrics"
            rows="5"
            :maxlength="LYRICS_MAX_CHARS"
            placeholder="[Verse 1]&#10;In the depths of shadow and stone…&#10;&#10;[Chorus]&#10;Rise, brave adventurer, rise…"
            class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-tone-arcane resize-none"
          />
          <p class="text-caption-sm text-muted-foreground/60">
            Use [Verse], [Chorus], [Bridge] markers. Parentheses for backing vocals.
          </p>
        </div>


        <!-- Status / error -->
        <div v-if="isGenerating" class="flex flex-col items-center gap-2 py-2">
          <IconGenerate class="h-6 w-6 text-primary animate-pulse" />
          <p class="text-body text-muted-foreground italic text-center">{{ currentLoadingQuote }}</p>
          <p class="text-caption-sm text-muted-foreground/60 text-center">A full track can take a few minutes.</p>
          <!-- Server runs only: the local-key path lives in this tab. -->
          <AppButton
            v-if="music.isGenerating.value"
            variant="ghost"
            size="inline-caption"
            class="underline underline-offset-2"
            label="Continue in background"
            @click="$emit('cancel')"
          />
        </div>
        <p v-if="isBusy && !isGenerating" class="text-caption text-muted-foreground text-center">
          {{ statusText }}
        </p>
        <p v-if="shownGenerateError" class="text-caption text-destructive">{{ shownGenerateError }}</p>

        <!-- The prompt Lyria refused, handed back to be reworded. Google names
             no word, only "sensitive words", so the DM has to see the text. -->
        <div v-if="editedPrompt !== null" class="space-y-1">
          <div class="flex items-center justify-between">
            <label for="sound-form-lyria-prompt" class="text-caption text-muted-foreground">Prompt sent to Lyria</label>
            <span
              class="text-caption-sm tabular-nums"
              :class="editedPrompt.length > MUSIC_PROMPT_MAX_CHARS - 200 ? 'text-ink-caution' : 'text-muted-foreground'"
            >{{ editedPrompt.length }} / {{ MUSIC_PROMPT_MAX_CHARS }}</span>
          </div>
          <textarea
            id="sound-form-lyria-prompt"
            v-model="editedPrompt"
            rows="10"
            :maxlength="MUSIC_PROMPT_MAX_CHARS"
            class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-tone-arcane resize-y"
          />
          <div class="flex items-start justify-between gap-2">
            <p class="text-caption-sm text-muted-foreground/60">
              Reword whatever Google objected to, then generate again. This prompt goes to Lyria exactly as written, so the description, length and vocals above no longer change it.
            </p>
            <AppButton variant="ghost" size="inline-xs" label="Discard" class="shrink-0" @click="editedPrompt = null" />
          </div>
        </div>
      </div>

      <!-- Browse Freesound -->
      <div v-else-if="activeSourceTab === 'browse'">
        <SoundProviderBrowser :page-id="pageId" @saved="$emit('saved')" />
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
        :tone="activeSourceTab === 'generate' ? 'arcane' : 'primary'"
        emphasis="strong"
        size="sm"
        :icon="activeSourceTab === 'generate' ? IconGenerate : undefined"
        :label="submitLabel"
        :disabled="submitDisabled"
      />
    </div>
  </form>

  <PaywallModal v-model="showPaywall" resource="sounds" />
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconGenerate } from "@/lib/icons";
import ProBadge from "@/components/common/ProBadge.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import type { SegmentedOption } from "@/components/common/SegmentedControl.vue";
import type { AppInputHandle } from "@/components/common/fieldVariants";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import MentionTextarea from "@/components/common/MentionTextarea.vue";
import { useCreateSound, useSoundUpload } from "@/composables/soundboard/useSounds";
import { useSpotifyStore } from "@/stores/spotify";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useCampaignStore } from "@/stores/campaign";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { parseSceneEntities, stripMentionTokens } from "@/ai/sceneEntities";
import {
  generateMusicLocally,
  composeFallbackPrompt,
  MUSIC_LENGTHS,
  MUSIC_GENERATION_TYPE,
  MUSIC_MAX_IMAGES,
  LYRICS_MAX_CHARS,
  MUSIC_PROMPT_MAX_CHARS,
  type FallbackPromptRequest,
  type MusicLengthSeconds,
  type MusicVocals,
} from "@/lib/audio/aiMusic";
import { logUsage, useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useMusicGeneration } from "@/ai/useMusicGeneration";
import { currentLoadingQuote, startAiQuotes, stopAiQuotes } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import SoundProviderBrowser from "@/components/soundboard/SoundProviderBrowser.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { isQuotaExceeded } from "@/lib/quotaError";
import type { SoundCategory } from "@/types/sound.types";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { wholeCredits } from "@edge-shared/credit-math.ts";

const spotifyStore = useSpotifyStore();
const { costOf } = useAiCredits();
// The server multiplies the song's price by Gemini's audio multiplier
// (generate-music), so the price shown here must too.
const { audioMultiplierFor } = useProviderConfig();
const musicCost = computed(() => wholeCredits(costOf(MUSIC_GENERATION_TYPE) * audioMultiplierFor("gemini")));
const { requireCredits } = useOutOfCredits();
const { isPro } = useSubscription();
// Upload (own audio, not AI) stays Pro-only; Generate reads the campaign's
// own AI Assistant toggle instead — the same gate generate-music enforces
// server-side. BYOK gets no exemption from the toggle, only from the credit
// charge (see GenerationCostBadge below).
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);

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
const showPaywall = ref(false);

type SourceTab = "url" | "upload" | "spotify" | "generate" | "browse";

const music = useMusicGeneration();

// A music draft that is running, failed, or holds a refused prompt reopens on
// the Generate tab, since that is what the badge's "Reopen" is for.
const activeSourceTab = ref<SourceTab>(
  isAiEnabled.value && (music.isGenerating.value || music.error.value || music.draft.editedPrompt.value !== null)
    ? "generate"
    : "url",
);
// The Generate tab is hidden while the campaign's AI is off; if the toggle
// flips with the dialog open on that tab, fall back rather than strand a form
// whose tab no longer exists.
watch(isAiEnabled, (enabled) => {
  if (!enabled && activeSourceTab.value === "generate") activeSourceTab.value = "url";
});

const form = ref<{ name: string; category: SoundCategory; external_url: string }>({
  // Reopened on a running or failed track: show the name and section it was started with.
  name: activeSourceTab.value === "generate" ? music.concept.value : "",
  category: activeSourceTab.value === "generate" ? music.draft.category.value : "ambient",
  external_url: "",
});
// Tracks that finished while nothing was waiting on them (a reload mid-run)
// are applied here; the badge then says so, like any background generation.
async function recoverReadyMusicJobs(): Promise<void> {
  if (!campaignId) return;
  try {
    await music.recoverReadyJobs(campaignId);
  } catch (error) {
    generateError.value = error instanceof Error ? error.message : "Could not recover completed music.";
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

const isValidSpotifyUrl = computed(() =>
  /open\.spotify\.com\/(track|playlist|album|episode)\/[a-zA-Z0-9]+/.test(form.value.external_url),
);

// ── Generate tab ──────────────────────────────────────────────────────────

// The draft lives in useMusicGeneration so it outlives this dialog.
const {
  description: generateDescription,
  lyrics: generateLyrics,
  lengthSeconds: generateLengthSeconds,
  vocals: generateVocals,
  editedPrompt,
} = music.draft;
// The local-vault BYOK path runs here in the foreground; the server path's
// progress is the module-level music.isGenerating.
const localGenerating = ref(false);
const isGenerating = computed(() => music.isGenerating.value || localGenerating.value);
const generateError = ref("");
const shownGenerateError = computed(() => generateError.value || music.error.value);

// @-mentions in the description resolve against the same campaign entities
// the Chronicler reads — their images go to Lyria, their descriptions go to
// the structuring step (see aiMusic.ts's "Mentioned characters and places").
const { mentionItems, partyMembers, npcs, monsters, locations, factions } = useEntityMentionItems();

const mentionedEntities = computed(() =>
  parseSceneEntities(generateDescription.value, {
    partyMembers: partyMembers.value,
    npcs: npcs.value,
    monsters: monsters.value,
    locations: locations.value,
    factions: factions.value,
    groupPortraitUrl: campaignStore.activeCampaign?.group_portrait_url,
  }),
);

const mentionedWithImages = computed(() =>
  mentionedEntities.value.filter((e) => e.portraitUrl).map((e) => e.label),
);

const MUSIC_LENGTH_OPTIONS: SegmentedOption<MusicLengthSeconds>[] = MUSIC_LENGTHS.map((l) => ({
  value: l.seconds,
  label: l.label,
}));

const VOCALS_OPTIONS: SegmentedOption<MusicVocals>[] = [
  { value: "instrumental", label: "Instrumental" },
  { value: "choir", label: "Choir" },
  { value: "vocals", label: "Vocals" },
];

const lyricsCharsLeft = computed(() => LYRICS_MAX_CHARS - generateLyrics.value.length);

// ── Submit state ──────────────────────────────────────────────────────────

const anyBusy = computed(() => isBusy.value || isPending.value || isGenerating.value);

const submitDisabled = computed(() => {
  if (anyBusy.value) return true;
  if (activeSourceTab.value === "spotify") return !isValidSpotifyUrl.value;
  if (activeSourceTab.value === "generate") {
    // Every generator waits for the others, as the NPC and roll-table panels do.
    return isAnyAiGenerating.value || !generateDescription.value.trim() ||
      (editedPrompt.value !== null && !editedPrompt.value.trim());
  }
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
  music.clearError();

  // Browse tab has its own per-row add flow; nothing for the form to do.
  if (activeSourceTab.value === "browse") return;

  // Wraps every branch below: none of the four `mutateAsync` create calls
  // (url, spotify, generated-then-uploaded, plain upload) had a catch of
  // their own, so a quota rejection — or any other failure — on the actual
  // create wrote nothing to the screen at all, not even the per-branch
  // `uploadError`/`generateError` those branches already show for their own
  // (upload/generation) steps.
  try {
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
    // Defensive: the Generate tab is hidden while the toggle is off, so this
    // only guards a stray trigger.
    if (!isAiEnabled.value) return;
    if (!geminiApiKey && !campaignId) return;

    // Unique portrait/image URLs from resolved @mentions — Lyria reads at
    // most MUSIC_MAX_IMAGES; over that, the DM trims mentions rather than
    // some of them silently going unread.
    const imageUrls = [...new Set(
      mentionedEntities.value.flatMap((e) => (e.portraitUrl ? [e.portraitUrl] : [])),
    )];
    if (imageUrls.length > MUSIC_MAX_IMAGES) {
      generateError.value = `Mention at most ${MUSIC_MAX_IMAGES} characters or places with pictures.`;
      return;
    }

    if (!requireCredits(musicCost.value, !!geminiApiKey)) return;

    const musicRequest: FallbackPromptRequest = {
      description: stripMentionTokens(generateDescription.value.trim()),
      lengthSeconds: generateLengthSeconds.value,
      vocals: generateVocals.value,
      lyrics: generateVocals.value === "vocals" ? (generateLyrics.value.trim() || undefined) : undefined,
      mentions: mentionedEntities.value.map((e) => ({ label: e.label, description: e.textDescription })),
      imageCount: imageUrls.length,
    };

    // Capture sound metadata before the async work begins. The server stores
    // the same snapshot on its durable job, so switching campaigns or pages
    // while Lyria runs can never attach the finished audio to the wrong board.
    const soundName = form.value.name.trim() || musicRequest.description.slice(0, 60);
    const soundCategory = form.value.category;
    const originatingCampaignId = campaignId;
    const originatingPageId = pageId ?? null;

    const promptOverride = editedPrompt.value?.trim() || null;
    const isLocalMode = typeof localStorage !== "undefined" && localStorage.getItem("grimoire_key_local_mode") === "local";

    // Server path: structuring and Lyria both run in generate-music's worker,
    // and useMusicGeneration waits on the job at module level, so the DM can
    // close this dialog ("Continue in background") and the badge takes over.
    if (!(isLocalMode && geminiApiKey)) {
      if (!originatingCampaignId) {
        generateError.value = "No campaign or API key configured for music generation.";
        return;
      }
      const done = await music.generate({
        campaignId: originatingCampaignId,
        pageId: originatingPageId,
        soundName,
        category: soundCategory,
        request: musicRequest,
        imageUrls,
        prompt: promptOverride,
      });
      if (done) {
        emit("saved");
        resetForm();
      }
      return;
    }

    // Local-vault BYOK path: browser-owned and legacy per the BYOK-tier
    // policy, so it runs in the foreground and sends a hand-composed prompt
    // (composeFallbackPrompt) rather than adding a second BYOK text-provider
    // call here.
    localGenerating.value = true;
    startAiQuotes("music");
    let file: File;
    // Built here, so a refusal can hand it back to be reworded.
    const localPrompt = promptOverride ?? composeFallbackPrompt(musicRequest);
    try {
      const generated = await generateMusicLocally(localPrompt, geminiApiKey, imageUrls);
      file = generated.file;
      logUsage({ reason: "music_generation", imageUsage: { model: generated.model, provider: "google", image_count: 1 } });
    } catch (err) {
      generateError.value = err instanceof Error ? err.message : "Generation failed.";
      editedPrompt.value = localPrompt;
      return;
    } finally {
      localGenerating.value = false;
      stopAiQuotes();
    }

    const result = await upload(file);
    if (!result) {
      generateError.value = "Upload failed. Please try again.";
      return;
    }
    await mutateAsync({
      name: form.value.name.trim() || musicRequest.description.slice(0, 60),
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
  } catch (e) {
    if (isQuotaExceeded(e)) { showPaywall.value = true; return; }
    const msg = e instanceof Error ? e.message : "Something went wrong";
    if (activeSourceTab.value === "generate") generateError.value = msg;
    else uploadError.value = msg;
  }
}

function resetForm() {
  form.value = { name: "", category: "ambient", external_url: "" };
  selectedFile.value = null;
  uploadError.value = "";
  music.resetDraft();
  music.clearError();
  generateError.value = "";
}
</script>
