<template>
  <div class="space-y-3">
    <!-- Search input -->
    <div class="space-y-1">
      <label class="text-caption text-muted-foreground">Search Freesound — royalty-free SFX</label>
      <input
        v-model="query"
        type="search"
        placeholder="e.g. tavern crowd, dragon roar, sword clash"
        class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-gold-500"
      />
    </div>

    <!-- Status -->
    <p v-if="isLoading" class="text-caption text-muted-foreground text-center">Searching…</p>
    <p v-else-if="isError" class="text-caption text-destructive">
      Search failed. {{ errorMessage }}
    </p>
    <p
      v-else-if="searchData && searchData.results.length === 0 && debouncedQuery.length >= 2"
      class="text-caption text-muted-foreground text-center"
    >
      No free-to-use matches for "{{ debouncedQuery }}".
    </p>
    <p
      v-else-if="!debouncedQuery || debouncedQuery.length < 2"
      class="text-caption text-muted-foreground/60 text-center"
    >
      Type at least 2 characters to search hundreds of thousands of free sound effects.
    </p>

    <!-- Results -->
    <ul v-if="searchData && searchData.results.length > 0" class="space-y-1.5 max-h-80 overflow-y-auto pr-1">
      <li
        v-for="hit in searchData.results"
        :key="hit.id"
        class="flex items-center gap-2 rounded-md border border-border bg-card/30 p-2 hover:border-gold-500/30 transition-colors"
      >
        <!-- Preview button -->
        <button
          type="button"
          class="shrink-0 flex items-center justify-center w-7 h-7 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
          :title="previewingId === hit.id ? 'Stop preview' : 'Preview'"
          @click="togglePreview(hit)"
        >
          <IconPause v-if="previewingId === hit.id" class="h-3.5 w-3.5" />
          <IconPlay v-else class="h-3.5 w-3.5 translate-x-px" />
        </button>

        <!-- Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <p class="font-cinzel text-xs text-foreground truncate">{{ hit.name }}</p>
            <span
              class="shrink-0 px-1 py-0.5 rounded text-caption-sm tracking-wide"
              :class="
                hit.license === 'cc0'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
              "
            >
              {{ hit.license === "cc0" ? "CC0" : "CC-BY" }}
            </span>
          </div>
          <p class="text-caption text-muted-foreground truncate">
            by {{ hit.username }} · {{ formatDuration(hit.duration) }}
            <span v-if="hit.tags.length > 0" class="opacity-60">· {{ hit.tags.slice(0, 3).join(", ") }}</span>
          </p>
        </div>

        <!-- Add button -->
        <button
          type="button"
          class="shrink-0 px-2 py-1 rounded-md border bg-gold-500/15 border-gold-500/40 text-gold-300 hover:bg-gold-500/25 font-cinzel text-xs tracking-wide transition-colors disabled:opacity-50"
          :disabled="addingId === hit.id"
          @click="addHit(hit)"
        >
          {{ addingId === hit.id ? "Adding…" : "Add" }}
        </button>
      </li>
    </ul>

    <!-- Pagination -->
    <div
      v-if="searchData && (searchData.page > 1 || searchData.has_next)"
      class="flex items-center justify-between gap-2 pt-1"
    >
      <button
        type="button"
        class="px-2 py-1 rounded-md border border-border text-caption text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
        :disabled="searchData.page <= 1"
        @click="page = Math.max(1, page - 1)"
      >
        ← Prev
      </button>
      <span class="text-caption text-muted-foreground">Page {{ searchData.page }}</span>
      <button
        type="button"
        class="px-2 py-1 rounded-md border border-border text-caption text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
        :disabled="!searchData.has_next"
        @click="page = page + 1"
      >
        Next →
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { refDebounced } from "@vueuse/core";
import { IconPause, IconPlay } from "@/lib/icons";
import { useFreesoundSearch, type FreesoundHit } from "@/composables/useFreesoundSearch";
import { useCreateSound } from "@/composables/useSounds";

const { pageId = null } = defineProps<{
  pageId?: string | null;
}>();

const emit = defineEmits<{
  (e: "saved"): void;
}>();

const query = ref("");
const debouncedQuery = refDebounced(query, 400);
const page = ref(1);

watch(debouncedQuery, () => {
  page.value = 1;
});

const searchQueryRef = computed(() => debouncedQuery.value);
const { data: searchData, isFetching: isLoading, isError, error } = useFreesoundSearch(searchQueryRef, page);

const errorMessage = computed(() => {
  if (!error.value) return "";
  return error.value instanceof Error ? error.value.message : "Unknown error";
});

// ── Inline preview ────────────────────────────────────────────────────────
// Keep the audio element out of Vue reactivity — same pattern as
// useSoundboardStore. A single shared element so only one preview plays at a time.

let previewAudio: HTMLAudioElement | null = null;
const previewingId = ref<number | null>(null);

function togglePreview(hit: FreesoundHit) {
  if (previewingId.value === hit.id) {
    stopPreview();
    return;
  }
  stopPreview();
  previewAudio = new Audio(hit.preview_url);
  previewAudio.volume = 0.8;
  previewAudio.onended = () => {
    if (previewingId.value === hit.id) previewingId.value = null;
  };
  previewAudio.play().catch(() => {
    previewingId.value = null;
  });
  previewingId.value = hit.id;
}

function stopPreview() {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio.src = "";
    previewAudio = null;
  }
  previewingId.value = null;
}

onBeforeUnmount(stopPreview);

// ── Add to library ────────────────────────────────────────────────────────

const { mutateAsync } = useCreateSound();
const addingId = ref<number | null>(null);

async function addHit(hit: FreesoundHit) {
  addingId.value = hit.id;
  try {
    await mutateAsync({
      name: hit.name,
      category: "effects",
      source_type: "freesound",
      file_url: hit.preview_url,
      storage_path: null,
      page_id: pageId ?? null,
      tags: hit.tags.slice(0, 8),
      sort_order: 0,
      attribution: hit.attribution,
      attribution_url: hit.attribution_url,
      artist: null,
      thumbnail_url: null,
    });
    emit("saved");
  } finally {
    addingId.value = null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
</script>
