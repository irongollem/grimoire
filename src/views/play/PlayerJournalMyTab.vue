<template>
  <!-- Category filter -->
  <div class="flex flex-wrap gap-1.5">
    <button
      type="button"
      class="px-2.5 py-1 rounded-full text-label md:text-sm font-semibold transition-colors border"
      :class="filterCategory === null
        ? 'bg-primary/15 text-primary border-primary/30'
        : 'text-muted-foreground border-border hover:border-foreground/30'"
      @click="$emit('update:filterCategory', null)"
    >All</button>
    <button
      v-for="[key, cat] in JOURNAL_CATEGORY_LIST"
      :key="key"
      type="button"
      class="px-2.5 py-1 rounded-full text-label md:text-sm font-semibold transition-colors border"
      :class="filterCategory === key
        ? 'border-current'
        : 'text-muted-foreground border-border hover:border-foreground/20'"
      :style="filterCategory === key ? { color: cat.color, backgroundColor: cat.color + '18', borderColor: cat.color + '60' } : {}"
      @click="$emit('update:filterCategory', filterCategory === key ? null : key)"
    >{{ cat.label }}</button>
  </div>

  <!-- Loading -->
  <div v-if="isLoading" class="flex justify-center py-12">
    <LoadingSpinner />
  </div>

  <!-- Empty state -->
  <div v-else-if="visibleEntries.length === 0" class="text-center py-16 space-y-3">
    <IconPopulate class="h-10 w-10 text-muted-foreground/30 mx-auto" />
    <p class="font-cinzel text-sm text-muted-foreground">Your journal is empty.</p>
    <p class="font-fell text-xs text-muted-foreground italic">Record your adventures, clues, and discoveries.</p>
  </div>

  <!-- Entry feed (draggable in manual sort, static otherwise) -->
  <component
    :is="sortBy === 'manual' ? VueDraggable : 'div'"
    v-else
    v-bind="dragBindings"
    class="flex flex-col gap-2"
  >
    <div
      v-for="entry in (sortBy === 'manual' ? dragEntries : visibleEntries)"
      :key="entry.id"
      class="relative"
    >
      <!-- Drag handle (manual sort only) -->
      <div
        v-if="sortBy === 'manual'"
        class="journal-drag-handle absolute left-1.5 top-1/2 -translate-y-1/2 z-10 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors"
        title="Drag to reorder"
      >
        <IconDrag class="h-3.5 w-3.5" />
      </div>
      <JournalCard
        :class="sortBy === 'manual' ? 'pl-5' : ''"
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
        <span v-if="entry.ref_label" class="font-fell text-xs text-muted-foreground/70 italic truncate max-w-32">{{ entry.ref_label }}</span>
        <span
          class="inline-flex items-center gap-1 text-label md:text-sm"
          :class="entry.is_private ? 'text-muted-foreground/50' : 'text-elven-green'"
        >
          <IconLock v-if="entry.is_private" class="h-2.5 w-2.5" />
          <IconReveal v-else class="h-2.5 w-2.5" />
          {{ entry.is_private ? 'Private' : 'Shared' }}
        </span>
        <span
          v-if="entry.is_private && entry.shared_with_dm"
          class="text-eyebrow px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600/80 dark:text-amber-400/80 border border-amber-500/20"
        >DM</span>
      </template>

      <!-- View mode -->
      <template v-if="editingId !== entry.id">
        <div class="px-4 py-4">
          <RichTextViewer :content="entry.content" />
          <div v-if="entry.tags?.length" class="flex flex-wrap gap-1 mt-3">
            <span
              v-for="tag in entry.tags"
              :key="tag"
              class="text-label md:text-sm px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
            >{{ tag }}</span>
          </div>
        </div>
        <div class="flex items-center gap-3 px-4 py-2 border-t border-border bg-muted/20">
          <button
            type="button"
            class="text-label-lg text-primary hover:opacity-80 transition-opacity"
            @click="$emit('startEdit', entry)"
          >Edit</button>
          <button
            type="button"
            class="text-label-lg text-muted-foreground/60 hover:text-destructive transition-colors"
            @click="$emit('removeEntry', entry)"
          >Delete</button>
        </div>
      </template>

      <!-- Edit mode -->
      <div v-else class="p-4 flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <select
            :value="editForm.category"
            class="bg-muted border border-border rounded-md px-2 py-1.5 font-cinzel text-xs font-semibold focus:outline-none"
            :style="{ color: JOURNAL_CATEGORIES[editForm.category as JournalCategory]?.color }"
            @change="$emit('editFormChange', { category: ($event.target as HTMLSelectElement).value as JournalCategory })"
          >
            <option v-for="[key, cat] in JOURNAL_CATEGORY_LIST" :key="key" :value="key">{{ cat.label }}</option>
          </select>
          <input
            :value="editForm.title ?? ''"
            placeholder="Entry title (optional)…"
            class="flex-1 min-w-32 bg-transparent border-b border-border px-1 py-1 font-cinzel text-sm font-bold text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
            @input="$emit('editFormChange', { title: ($event.target as HTMLInputElement).value })"
          />
        </div>
        <RichTextEditor
          :model-value="editForm.content"
          min-height="160px"
          allow-upload
          :entity-mention-items="mentionItems"
          @update:model-value="(v: string) => $emit('editFormChange', { content: v })"
        />
        <div class="flex flex-wrap items-center gap-2">
          <select
            :value="editForm.ref_type"
            class="bg-muted border border-border rounded-md px-2 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @change="$emit('editFormChange', { ref_type: ($event.target as HTMLSelectElement).value, ref_id: '' })"
          >
            <option value="">No context</option>
            <option value="quest">Quest</option>
            <option value="npc">NPC</option>
            <option value="location">Location</option>
            <option value="item">Item</option>
            <option value="monster">Monster</option>
            <option value="encounter">Encounter</option>
          </select>
          <select
            v-if="editForm.ref_type"
            :value="editForm.ref_id"
            class="flex-1 min-w-32 bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @change="$emit('editFormChange', { ref_id: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">— Select —</option>
            <option v-for="opt in editRefOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</option>
          </select>
        </div>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 text-label-lg font-semibold transition-colors px-2 py-1 rounded border"
              :class="editForm.is_private
                ? 'text-muted-foreground border-border'
                : 'text-elven-green border-elven-green/30 bg-elven-green/10'"
              @click="$emit('editFormChange', { is_private: !editForm.is_private, shared_with_dm: editForm.is_private ? editForm.shared_with_dm : false })"
            >
              <IconLock v-if="editForm.is_private" class="h-3 w-3" />
              <IconReveal v-else class="h-3 w-3" />
              {{ editForm.is_private ? 'Private' : 'Shared' }}
            </button>
            <label v-if="editForm.is_private" class="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                :checked="editForm.shared_with_dm"
                type="checkbox"
                class="rounded border-border accent-amber-500 h-3 w-3"
                @change="$emit('editFormChange', { shared_with_dm: ($event.target as HTMLInputElement).checked })"
              />
              <span class="text-label-lg text-amber-600/80 dark:text-amber-400/80">Share with DM</span>
            </label>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="text-label-lg text-muted-foreground hover:text-foreground"
              @click="$emit('cancelEdit')"
            >Cancel</button>
            <button
              type="button"
              :disabled="isRteEmpty(editForm.content) || saving"
              class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-label-lg font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              @click="$emit('submitEdit')"
            >
              <IconLoading v-if="saving" class="h-3.5 w-3.5 animate-spin" />
              <IconSave v-else class="h-3.5 w-3.5" />
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
      </JournalCard>
    </div>
  </component>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { IconDrag, IconLoading, IconLock, IconPopulate, IconReveal, IconSave } from '@/lib/icons';
import JournalCard from '@/components/player/JournalCard.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import RichTextEditor from '@/components/common/RichTextEditor.vue';
import RichTextViewer from '@/components/common/RichTextViewer.vue';
import { JOURNAL_CATEGORIES, JOURNAL_CATEGORY_LIST } from '@/composables/usePlayerJournal';
import type { JournalCategory, PlayerJournalEntry } from '@/composables/usePlayerJournal';
import type { SortField } from '@/lib/noteSort';
import type { EntityMentionItem } from '@/lib/tiptap/EntityMention';
import type { Component } from 'vue';

const {
  isLoading,
  visibleEntries,
  sortBy,
  filterCategory,
  expanded,
  editingId,
  editForm,
  editRefOptions,
  saving,
  mentionItems,
  categoryIcon,
  contentPreview,
  formatDate,
  isRteEmpty,
} = defineProps<{
  isLoading: boolean;
  visibleEntries: PlayerJournalEntry[];
  sortBy: SortField;
  filterCategory: JournalCategory | null;
  expanded: string | null;
  editingId: string | null;
  editForm: {
    title: string | null;
    content: string;
    category: JournalCategory;
    is_private: boolean;
    shared_with_dm: boolean;
    ref_type: string;
    ref_id: string;
  };
  editRefOptions: { id: string; name: string }[];
  saving: boolean;
  mentionItems: EntityMentionItem[];
  categoryIcon: (cat: string) => Component;
  contentPreview: (content: string) => string;
  formatDate: (iso: string) => string;
  isRteEmpty: (val: string) => boolean;
}>();

const emit = defineEmits<{
  (e: 'update:filterCategory', value: JournalCategory | null): void;
  (e: 'toggle', id: string): void;
  (e: 'startEdit', entry: PlayerJournalEntry): void;
  (e: 'removeEntry', entry: PlayerJournalEntry): void;
  (e: 'editFormChange', patch: Partial<typeof editForm>): void;
  (e: 'cancelEdit'): void;
  (e: 'submitEdit'): void;
  (e: 'reorder', ids: string[]): void;
}>();

// Local mutable copy for drag-and-drop (manual sort); kept in sync with the
// parent-supplied list and persisted on drag end.
const dragEntries = ref<PlayerJournalEntry[]>([]);
watch(() => visibleEntries, (list) => { dragEntries.value = [...list]; }, { immediate: true });

function persistOrder() {
  emit('reorder', dragEntries.value.map((entry) => entry.id));
}

// VueDraggable props are only bound when manual sort is active, so the static
// <div> fallback never receives stray drag attributes.
const dragBindings = computed(() =>
  sortBy === 'manual'
    ? {
        modelValue: dragEntries.value,
        'onUpdate:modelValue': (v: PlayerJournalEntry[]) => { dragEntries.value = v; },
        handle: '.journal-drag-handle',
        animation: 150,
        ghostClass: 'opacity-40',
        onEnd: persistOrder,
      }
    : {},
);
</script>
