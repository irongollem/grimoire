<template>
  <ListPageLayout title="Soundboard" description="Ambient sounds & music for your sessions">
    <template #actions>
      <!-- Spotify connect/disconnect (only for the owner user) -->
      <template v-if="spotifyStore.isEnabled">
        <button
          v-if="spotifyStore.isConnected"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
          :class="
            spotifyStore.isReady
              ? 'border-green-500/40 text-green-400 hover:text-green-300 hover:border-green-500/60'
              : 'border-border text-muted-foreground'
          "
          :title="spotifyStore.isReady ? 'Spotify connected — click to disconnect' : 'Connecting to Spotify…'"
          @click="spotifyStore.isReady ? spotifyStore.disconnect() : undefined"
        >
          <Music2 class="h-3.5 w-3.5 shrink-0" />
          {{ spotifyStore.isReady ? "Spotify" : "Connecting…" }}
        </button>
        <button
          v-else
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-cinzel tracking-wide text-muted-foreground hover:text-foreground transition-colors"
          title="Connect your Spotify account"
          @click="spotifyStore.connect()"
        >
          <Music2 class="h-3.5 w-3.5 shrink-0" />
          Connect Spotify
        </button>
      </template>

      <ListActionButton
        :icon="Plus"
        label="Add Sound"
        variant="primary"
        @click="showForm = !showForm"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="ui.soundboardHasActiveFilters"
        @clear="ui.resetSoundboardFilters()"
      >
        <ListSearchInput v-model="ui.soundboardSearchQuery" placeholder="Search sounds…" />
        <SoundCategoryFilter v-model="ui.soundboardFilterCategory" />
      </ListFilterBar>
    </template>

    <!-- Add form (inline) -->
    <div v-if="showForm" class="mb-4">
      <SoundForm @saved="showForm = false" @cancel="showForm = false" />
    </div>

    <!-- Loading -->
    <LoadingSpinner v-if="isPending" />

    <!-- Empty state -->
    <EmptyState
      v-else-if="filtered.length === 0 && !ui.soundboardHasActiveFilters"
      icon="music"
      title="No sounds yet"
      description="Add ambient tracks, music, and effects for your sessions."
      action-label="Add Sound"
      @action="showForm = true"
    />

    <div
      v-else-if="filtered.length === 0"
      class="py-10 text-center font-fell text-sm text-muted-foreground italic"
    >
      No sounds match your filters.
    </div>

    <!-- Sound grid -->
    <template v-else>
      <!-- Drag hint when filters are active -->
      <p
        v-if="ui.soundboardHasActiveFilters"
        class="mb-2 font-fell text-xs text-muted-foreground italic"
      >
        Clear filters to reorder cards.
      </p>

      <VueDraggable
        v-model="orderedSounds"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        :disabled="ui.soundboardHasActiveFilters"
        handle=".drag-handle"
        :animation="150"
        ghost-class="opacity-40"
        @end="persistOrder"
      >
        <div v-for="sound in orderedSounds" :key="sound.id" class="group relative">
          <!-- Drag handle — only visible when not filtered -->
          <div
            v-if="!ui.soundboardHasActiveFilters"
            class="drag-handle absolute top-2 left-2 z-10 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors opacity-0 group-hover:opacity-100"
            title="Drag to reorder"
          >
            <GripVertical class="h-3.5 w-3.5" />
          </div>
          <SoundCard
            :sound="sound"
            :show-delete="true"
            @delete="handleDelete"
          />
        </div>
      </VueDraggable>
    </template>
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { Plus, GripVertical, Music2 } from "lucide-vue-next";
import { VueDraggable } from "vue-draggable-plus";
import { useSounds, useDeleteSound, useReorderSounds } from "@/composables/useSounds";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";
import { useUiStore } from "@/stores/ui";
import type { Sound } from "@/types/sound.types";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import SoundCard from "@/components/soundboard/SoundCard.vue";
import SoundForm from "@/components/soundboard/SoundForm.vue";
import SoundCategoryFilter from "@/components/soundboard/SoundCategoryFilter.vue";

const ui = useUiStore();
const soundboardStore = useSoundboardStore();
const spotifyStore = useSpotifyStore();

// Initialise the Spotify SDK as soon as the soundboard mounts (if connected).
onMounted(() => spotifyStore.initSDK());
const { data: sounds, isPending } = useSounds();
const { mutateAsync: deleteSound } = useDeleteSound();
const { mutate: reorderSounds } = useReorderSounds();

const showForm = ref(false);

// ── Filtering ─────────────────────────────────────────────────────────────

const filtered = computed(() => {
  let list = sounds.value ?? [];

  if (ui.soundboardFilterCategory !== "all") {
    list = list.filter((s) => s.category === ui.soundboardFilterCategory);
  }

  const q = ui.soundboardSearchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((s) => s.name.toLowerCase().includes(q));
  }

  return list;
});

// ── Drag-drop ordering ────────────────────────────────────────────────────
//
// orderedSounds is a local copy of filtered used as the v-model for
// VueDraggable. It stays in sync with the server list unless the user
// is actively reordering (filters off). After a drag we fire persistOrder.

const orderedSounds = ref<Sound[]>([]);

watch(
  filtered,
  (newList) => {
    orderedSounds.value = [...newList];
  },
  { immediate: true },
);

function persistOrder() {
  reorderSounds(orderedSounds.value.map((s) => s.id));
}

// ── Delete ────────────────────────────────────────────────────────────────

async function handleDelete(sound: Sound) {
  await deleteSound(sound);
  soundboardStore.releaseSound(sound.id);
}
</script>
