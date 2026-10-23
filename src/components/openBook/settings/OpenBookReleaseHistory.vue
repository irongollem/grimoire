<template>
  <div>
    <h3 class="text-label-lg font-semibold uppercase text-muted-foreground">Releases</h3>
    <p v-if="releases.length === 0" class="mt-2 text-caption text-muted-foreground">Nothing released yet.</p>
    <div
      v-for="release in releases"
      :key="release.id"
      class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-border py-2 text-label-lg"
    >
      <span class="font-cinzel">{{ release.number }}</span>
      <span class="min-w-0 truncate">{{ formatReleaseDate(release.created_at) }} · {{ release.note ?? "No note" }}</span>
      <span v-if="release.id === liveId" class="font-semibold text-tone-success">Live</span>
      <AppButton
        v-else
        variant="link"
        size="xs"
        label="Put back"
        :disabled="busy"
        @click="emit('putBack', release.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { OpenBookRelease } from "@/types/openBook.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import { formatReleaseDate } from "./releaseDate";

defineProps<{ releases: OpenBookRelease[]; liveId: string | null; busy: boolean }>();
const emit = defineEmits<{ putBack: [releaseId: string] }>();
</script>
