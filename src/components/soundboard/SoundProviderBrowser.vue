<template>
  <div class="space-y-3">
    <!-- Source tabs — only worth showing once there is a choice to make -->
    <div v-if="SOUND_PROVIDERS.length > 1" class="flex items-center gap-1 border-b border-border">
      <button
        v-for="p in SOUND_PROVIDERS"
        :key="p.id"
        type="button"
        class="px-2.5 py-1.5 font-cinzel text-xs tracking-wide border-b-2 -mb-px transition-colors"
        :class="
          p.id === provider.id
            ? 'border-gold-500 text-gold-300'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        "
        @click="selectProvider(p)"
      >
        {{ p.label }}
      </button>
    </div>

    <p class="text-caption text-muted-foreground/70">
      {{ provider.attributionNote }}
      <RouterLink
        v-if="provider.id === LIBRARY_PROVIDER_ID"
        to="/soundboard/credits"
        class="underline hover:text-foreground"
      >
        Credits
      </RouterLink>
    </p>

    <!-- Search input -->
    <div class="space-y-1">
      <label class="text-caption text-muted-foreground">Search {{ provider.label }}</label>
      <AppInput
        v-model="query"
        type="search"
        size="body"
        placeholder="e.g. tavern crowd, dragon roar, sword clash"
      />
    </div>

    <!-- Filters. Length is the one that matters most: without it, hunting a
         three-second door creak means auditioning forty-second field recordings. -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-1">
        <AppButton
          v-for="preset in LENGTH_PRESETS"
          :key="preset.label"
          variant="subtle"
          size="body"
          :active="isActivePreset(preset)"
          :label="preset.label"
          @click="applyPreset(preset)"
        />
      </div>

      <AppSelect
        v-model="filters.sort"
        tone="default"
        size="caption"
        weight="normal"
        aria-label="Sort results"
      >
        <option v-for="option in PROVIDER_SORTS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </AppSelect>

      <AppButton
        v-if="hasActiveFilters"
        variant="subtle"
        size="body"
        label="Clear"
        @click="resetFilters"
      />
    </div>

    <!-- Status -->
    <p v-if="isLoading" class="text-caption text-muted-foreground text-center">Searching…</p>
    <p v-else-if="isError" class="text-caption text-destructive">Search failed. {{ errorMessage }}</p>
    <p
      v-else-if="searchData && searchData.hits.length === 0 && debouncedQuery.length >= provider.minQueryLength"
      class="text-caption text-muted-foreground text-center"
    >
      No free-to-use matches for "{{ debouncedQuery }}".
    </p>
    <p v-else-if="!hasEnoughQuery" class="text-caption text-muted-foreground/60 text-center">
      {{ emptyPrompt }}
    </p>

    <!-- Results -->
    <ul v-if="searchData && searchData.hits.length > 0" class="space-y-1.5 max-h-80 overflow-y-auto pr-1">
      <SoundProviderRow
        v-for="hit in searchData.hits"
        :key="hit.id"
        :hit="hit"
        :is-previewing="previewingId === hit.id"
        :is-adding="addingId === hit.id"
        @preview="togglePreview(hit)"
        @add="addHit(hit)"
      />
    </ul>

    <!-- Pagination -->
    <div
      v-if="searchData && (searchData.page > 1 || searchData.hasNext)"
      class="flex items-center justify-between gap-2 pt-1"
    >
      <AppButton
        variant="subtle"
        size="body"
        label="← Prev"
        :disabled="searchData.page <= 1"
        @click="page = Math.max(1, page - 1)"
      />
      <span class="text-caption text-muted-foreground">
        Page {{ searchData.page }}<span v-if="searchData.total !== null"> · {{ searchData.total }} sounds</span>
      </span>
      <AppButton
        variant="subtle"
        size="body"
        label="Next →"
        :disabled="!searchData.hasNext"
        @click="page = page + 1"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { RouterLink } from "vue-router";
import { refDebounced } from "@vueuse/core";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import SoundProviderRow from "./SoundProviderRow.vue";
import { useProviderSearch } from "@/composables/soundboard/useProviderSearch";
import {
  SOUND_PROVIDERS,
  LIBRARY_PROVIDER_ID,
  PROVIDER_SORTS,
  DEFAULT_PROVIDER_FILTERS,
  defaultProvider,
  type ProviderHit,
  type ProviderFilters,
  type SoundProvider,
} from "@/lib/audio/providers";
import { useCreateSound } from "@/composables/soundboard/useSounds";

const { pageId = null } = defineProps<{
  pageId?: string | null;
}>();

const emit = defineEmits<{
  (e: "saved"): void;
}>();

const query = ref("");
const debouncedQuery = refDebounced(query, 400);
const page = ref(1);
const filters = ref<ProviderFilters>({ ...DEFAULT_PROVIDER_FILTERS });

// Any change to what is being asked for starts again at page one — otherwise a
// narrowed search lands the DM on page 4 of a 2-page result set.
watch([debouncedQuery, filters], () => {
  page.value = 1;
}, { deep: true });

/**
 * Length presets rather than two number inputs. The real questions a DM has are
 * "is this a one-shot or a bed", and typing bounds in seconds is a slower way
 * to ask them.
 */
const LENGTH_PRESETS = [
  { label: "Any length", minDuration: null, maxDuration: null },
  { label: "Under 5s", minDuration: null, maxDuration: 5 },
  { label: "5–30s", minDuration: 5, maxDuration: 30 },
  { label: "Over 30s", minDuration: 30, maxDuration: null },
] as const;

type LengthPreset = (typeof LENGTH_PRESETS)[number];

function isActivePreset(preset: LengthPreset): boolean {
  return (
    filters.value.minDuration === preset.minDuration &&
    filters.value.maxDuration === preset.maxDuration
  );
}

function applyPreset(preset: LengthPreset): void {
  filters.value.minDuration = preset.minDuration;
  filters.value.maxDuration = preset.maxDuration;
}

const hasActiveFilters = computed(
  () =>
    filters.value.minDuration !== null ||
    filters.value.maxDuration !== null ||
    filters.value.sort !== DEFAULT_PROVIDER_FILTERS.sort,
);

function resetFilters(): void {
  filters.value = { ...DEFAULT_PROVIDER_FILTERS };
}

const searchQueryRef = computed(() => debouncedQuery.value);
// Adapter-driven: the browser knows nothing about any provider specifically, so
// one can be swapped or removed without touching this component.
const provider = ref<SoundProvider>(defaultProvider() ?? SOUND_PROVIDERS[0]);
const {
  data: searchData,
  isFetching: isLoading,
  isError,
  error,
} = useProviderSearch(provider, searchQueryRef, page, filters);

function selectProvider(next: SoundProvider): void {
  if (next.id === provider.value.id) return;
  stopPreview();
  provider.value = next;
  page.value = 1;
}

const hasEnoughQuery = computed(() => debouncedQuery.value.trim().length >= provider.value.minQueryLength);

const emptyPrompt = computed(() =>
  provider.value.minQueryLength <= 1
    ? "Type to search the library — or browse a theme like rain, tavern or dungeon."
    : `Type at least ${provider.value.minQueryLength} characters to search.`,
);

const errorMessage = computed(() => {
  if (!error.value) return "";
  return error.value instanceof Error ? error.value.message : "Unknown error";
});

// ── Inline preview ────────────────────────────────────────────────────────
// Keep the audio element out of Vue reactivity — same pattern as
// useSoundboardStore. A single shared element so only one preview plays at a time.

let previewAudio: HTMLAudioElement | null = null;
const previewingId = ref<string | null>(null);

function togglePreview(hit: ProviderHit) {
  if (previewingId.value === hit.id) {
    stopPreview();
    return;
  }
  stopPreview();
  previewAudio = new Audio(hit.audioUrl);
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
const addingId = ref<string | null>(null);

async function addHit(hit: ProviderHit) {
  addingId.value = hit.id;
  try {
    await mutateAsync({
      name: hit.name,
      // The catalogue classifies onto a bus; a third party does not, and a
      // one-shot on the effects bus is the safe default for an unknown clip.
      category: hit.category === null ? "effects" : hit.category,
      source_type: provider.value.sourceType,
      file_url: hit.audioUrl,
      // Never a storage path, even for catalogue sounds: that file is shared by
      // every campaign, and recording it here would let one DM's delete remove
      // it for everyone.
      storage_path: null,
      library_id: hit.libraryId,
      page_id: pageId,
      tags: hit.tags.slice(0, 8),
      sort_order: 0,
      attribution: hit.attribution,
      attribution_url: hit.attributionUrl,
      artist: null,
      thumbnail_url: null,
    });
    emit("saved");
  } finally {
    addingId.value = null;
  }
}
</script>
