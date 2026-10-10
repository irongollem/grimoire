<template>
  <!-- Category filter -->
  <div class="flex flex-wrap gap-1.5">
    <AppButton
      variant="subtle"
      size="xs"
      shape="pill"
      :active="filterCategory === null"
      label="All"
      @click="$emit('update:filterCategory', null)"
    />
    <!--
      The chips take their colour from the category row, so they cannot use the
      `tone` enum — but that is no reason for half the row to be a primitive and
      half to be hand-rolled, which is exactly the drift this sweep removes. They
      are AppButtons like the "All" chip beside them, with the one thing no enum
      can express — a runtime colour — handed over as an inline style. Inline
      styles beat the variant's classes, so the selected chip shows its own colour
      instead of the gold `active` tint; everything else about the box comes from
      the primitive.
    -->
    <AppButton
      v-for="[key, cat] in JOURNAL_CATEGORY_LIST"
      :key="key"
      variant="subtle"
      size="xs"
      shape="pill"
      :active="filterCategory === key"
      :style="filterCategory === key ? { color: cat.color, backgroundColor: cat.color + '18', borderColor: cat.color + '60' } : undefined"
      :label="cat.label"
      @click="$emit('update:filterCategory', filterCategory === key ? null : key)"
    />
  </div>

  <!-- Loading -->
  <ListSkeleton v-if="isLoading" variant="stack" />

  <!-- Empty state -->
  <div v-else-if="visibleEntries.length === 0" class="text-center py-16 space-y-3">
    <IconPopulate class="h-10 w-10 text-muted-foreground/30 mx-auto" />
    <p class="text-body text-muted-foreground">No shared entries from the party yet.</p>
  </div>

  <!-- Entry feed -->
  <VirtualGrid
    v-else
    :items="visibleEntries"
    :item-key="entryKey"
    :columns="1"
    :estimate-row-height="ENTRY_ROW_PX"
    :gap="0.5"
  >
    <template #default="{ item: entry }">
    <JournalCard
      :color="JOURNAL_CATEGORIES[entry.category]?.color ?? '#6b7280'"
      :icon="categoryIcon(entry.category)"
      :category-label="JOURNAL_CATEGORIES[entry.category]?.label ?? ''"
      :title="entry.title || contentPreview(entry.content)"
      :preview="entry.title ? contentPreview(entry.content) : undefined"
      :date="formatDate(entry.created_at)"
      :expanded="expanded === entry.id"
      @toggle="$emit('toggle', entry.id)"
    >
      <template #meta>
        <span v-if="entry.ref_label" class="text-caption text-muted-foreground/70 italic truncate max-w-32">{{ entry.ref_label }}</span>
        <span v-if="authorName(entry)" class="text-caption text-muted-foreground/70 italic">by {{ authorName(entry) }}</span>
      </template>
      <div class="px-4 py-4">
        <RichTextViewer :content="entry.content" />
        <div v-if="entry.tags?.length" class="flex flex-wrap gap-1 mt-3">
          <span
            v-for="tag in entry.tags"
            :key="tag"
            class="text-label px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
          >{{ tag }}</span>
        </div>
      </div>
    </JournalCard>
    </template>
  </VirtualGrid>
</template>

<script setup lang="ts">
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import VirtualGrid from "@/components/common/list/VirtualGrid.vue";
import { IconPopulate } from '@/lib/icons';
import AppButton from '@/components/common/controls/AppButton.vue';
import JournalCard from '@/components/player/JournalCard.vue';
import RichTextViewer from '@/components/common/richtext/RichTextViewer.vue';
import { JOURNAL_CATEGORIES, JOURNAL_CATEGORY_LIST } from '@/composables/notes/usePlayerJournal';
import type { JournalCategory, PlayerJournalEntry } from '@/composables/notes/usePlayerJournal';
import type { Component } from 'vue';

const {
  isLoading,
  visibleEntries,
  filterCategory,
  expanded,
  categoryIcon,
  contentPreview,
  formatDate,
  authorName,
} = defineProps<{
  isLoading: boolean;
  visibleEntries: PlayerJournalEntry[];
  filterCategory: JournalCategory | null;
  expanded: string | null;
  categoryIcon: (cat: string) => Component;
  contentPreview: (content: string) => string;
  formatDate: (iso: string) => string;
  authorName: (entry: PlayerJournalEntry) => string | null;
}>();

// Row height before a row is measured (px): 84px, the same journal card as the My tab, measured at a 390px
// phone on 8 Oct 2026 over the dev:campaigns fixture. It decides where a
// restored scroll lands, since coming back from a detail re-renders every
// unmeasured row above the viewport.
const ENTRY_ROW_PX = 84;
const entryKey = (entry: PlayerJournalEntry) => entry.id;

defineEmits<{
  (e: 'update:filterCategory', value: JournalCategory | null): void;
  (e: 'toggle', id: string): void;
}>();
</script>
