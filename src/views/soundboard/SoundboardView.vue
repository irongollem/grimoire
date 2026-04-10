<template>
  <PageHeader title="Soundboard" description="Ambient sounds & music for your sessions">
    <template #actions>
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gold-500/20 border border-gold-500/40 text-xs font-cinzel text-gold-300 hover:bg-gold-500/30 transition-colors"
        @click="showForm = !showForm"
      >
        <Plus class="h-3.5 w-3.5" />
        Add Sound
      </button>
    </template>

    <template #sticky>
      <div class="flex flex-wrap items-center gap-3">
        <!-- Search -->
        <div class="relative">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            v-model="ui.soundboardSearchQuery"
            type="text"
            placeholder="Search sounds…"
            class="pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-sm font-fell text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-gold-500 w-48"
          />
        </div>

        <!-- Category filter -->
        <SoundCategoryFilter v-model="ui.soundboardFilterCategory" />

        <!-- Clear -->
        <button
          v-if="ui.soundboardHasActiveFilters"
          class="font-fell text-xs text-muted-foreground hover:text-foreground transition-colors"
          @click="ui.resetSoundboardFilters()"
        >
          Clear
        </button>
      </div>
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
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <SoundCard
        v-for="sound in filtered"
        :key="sound.id"
        :sound="sound"
        :show-delete="true"
        @delete="handleDelete"
      />
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Plus, Search } from "lucide-vue-next";
import { useSounds, useDeleteSound } from "@/composables/useSounds";
import { useSoundboardStore } from "@/stores/soundboard";
import { useUiStore } from "@/stores/ui";
import type { Sound } from "@/types/sound.types";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import SoundCard from "@/components/soundboard/SoundCard.vue";
import SoundForm from "@/components/soundboard/SoundForm.vue";
import SoundCategoryFilter from "@/components/soundboard/SoundCategoryFilter.vue";

const ui = useUiStore();
const soundboardStore = useSoundboardStore();
const { data: sounds, isPending } = useSounds();
const { mutateAsync: deleteSound } = useDeleteSound();

const showForm = ref(false);

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

async function handleDelete(sound: Sound) {
  await deleteSound(sound);
  soundboardStore.releaseSound(sound.id);
}
</script>
