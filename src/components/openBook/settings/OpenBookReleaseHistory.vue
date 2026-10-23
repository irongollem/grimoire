<template>
  <div>
    <h3 class="text-label-lg font-semibold uppercase text-muted-foreground">Releases</h3>
    <p v-if="releases.length === 0" class="mt-2 text-caption text-muted-foreground">Nothing released yet.</p>
    <div v-for="release in releases" :key="release.id" class="border-b border-border py-2">
      <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-3 text-label-lg">
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
      <div class="mt-1 flex flex-wrap items-center gap-x-4 pl-6">
        <AppButton
          v-if="exportingId === release.id"
          variant="link"
          size="xs"
          :label="phaseLabel"
          loading
          disabled
        />
        <template v-else>
          <AppButton
            v-if="release.pdf_url"
            variant="link"
            size="xs"
            label="PDF"
            :href="release.pdf_url"
            target="_blank"
            rel="noopener"
          />
          <AppButton
            variant="link"
            size="xs"
            :label="release.pdf_url ? 'Replace PDF' : 'Export PDF'"
            :disabled="exportingId !== null"
            @click="emit('exportPdf', release)"
          />
        </template>
      </div>
    </div>
    <p v-if="pdfError" role="alert" class="mt-2 text-caption text-destructive">{{ pdfError }}</p>
  </div>
</template>

<script setup lang="ts">
import type { OpenBookRelease } from "@/types/openBook.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import { formatReleaseDate } from "./releaseDate";

defineProps<{
  releases: OpenBookRelease[];
  liveId: string | null;
  busy: boolean;
  /** The release a PDF is being made for, and how far along it is. */
  exportingId: string | null;
  phaseLabel: string;
  pdfError: string;
}>();
const emit = defineEmits<{ putBack: [releaseId: string]; exportPdf: [release: OpenBookRelease] }>();
</script>
