<template>
  <ListPageLayout title="Soundboard" description="Ambient sounds & music for your sessions">
    <template #actions>
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
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <SoundCard
        v-for="sound in filtered"
        :key="sound.id"
        :sound="sound"
        :show-delete="true"
        @delete="handleDelete"
      />
    </div>
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Plus } from "lucide-vue-next";
import { useSounds, useDeleteSound } from "@/composables/useSounds";
import { useSoundboardStore } from "@/stores/soundboard";
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
