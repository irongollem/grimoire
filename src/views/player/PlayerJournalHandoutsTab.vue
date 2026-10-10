<template>
  <ListSkeleton v-if="isLoading" variant="stack" />
  <div v-else-if="!handouts.length" class="text-center py-12">
    <IconScrollText class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
    <p class="font-fell text-muted-foreground italic">Your DM has not handed you anything to read yet.</p>
  </div>
  <VirtualGrid
    v-else
    :items="handouts"
    :item-key="handoutKey"
    :columns="1"
    :estimate-row-height="CARD_ROW_PX"
    :gap="0.5"
  >
    <template #default="{ item: h }">
      <RouterLink
        :to="{ name: 'play-handout', params: { id: h.id } }"
        class="block overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
        :data-testid="`handout-${h.id}`"
      >
        <div class="h-0.5 w-full" :style="{ backgroundColor: docTypeColor(h.doc_type) }" />
        <div class="flex items-start gap-3 px-4 py-3">
          <IconScrollText class="h-4 w-4 shrink-0 mt-0.5" :style="{ color: docTypeColor(h.doc_type) }" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-2">
              <p class="text-heading-xs font-semibold text-foreground truncate">{{ h.title }}</p>
              <span class="text-label shrink-0" :style="{ color: docTypeColor(h.doc_type) }">{{ docTypeLabel(h.doc_type) }}</span>
            </div>
            <div class="mt-1.5 flex flex-wrap items-center gap-3">
              <span class="text-label text-muted-foreground/60">{{ formatDate(h.updated_at) }}</span>
              <EntityNewDot :is-new="isNew(h.id, h.updated_at)" title="New" />
            </div>
          </div>
          <IconChevronRight class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </RouterLink>
    </template>
  </VirtualGrid>
</template>

<script setup lang="ts">
/**
 * The Handouts tab (#970): Scriptorium documents the DM has put in this
 * player's hands. A card opens the reader at /play/handouts/:id. The date is
 * the document's last update, so an edit by the DM reads as fresh and relights
 * the dot (same live rule as the DM Notes tab).
 */
import ListSkeleton from "@/components/common/ListSkeleton.vue";
import VirtualGrid from "@/components/common/VirtualGrid.vue";
import { RouterLink } from "vue-router";
import { IconChevronRight, IconScrollText } from "@/lib/icons";
import EntityNewDot from "@/components/common/EntityNewDot.vue";
import { docTypeColor, docTypeLabel } from "@/lib/scriptorium/editorConstants";
import type { PlayerHandoutSummary } from "@/composables/scriptorium/usePlayerHandouts";

defineProps<{
  isLoading: boolean;
  handouts: PlayerHandoutSummary[];
  isNew: (id: string, updatedAt: string) => boolean;
  formatDate: (iso: string) => string;
}>();

// A player's handouts grow with every session, so the list is windowed.
// Row height before it is measured (px): 2 border + 2 type rule (h-0.5) + 24
// padding (py-3) + 20 title (text-heading-xs) + 6 (mt-1.5) + 11 date line
// (text-label) = 65. Rows are re-measured as they mount.
const CARD_ROW_PX = 65;
const handoutKey = (h: PlayerHandoutSummary) => h.id;
</script>
