<template>
  <!-- Category filter -->
  <div class="flex flex-wrap gap-1.5">
    <AppButton
      variant="subtle" shape="pill" size="xs"
      :active="filterCategory === null"
      label="All"
      @click="$emit('update:filterCategory', null)"
    />
    <AppButton
      v-for="[key, cat] in JOURNAL_CATEGORY_LIST"
      :key="key"
      variant="subtle" shape="pill" size="xs"
      :active="filterCategory === key"
      :class="filterCategory === key ? 'border-current' : ''"
      :style="filterCategory === key ? { color: cat.color, backgroundColor: cat.color + '18', borderColor: cat.color + '60' } : {}"
      :label="cat.label"
      @click="$emit('update:filterCategory', filterCategory === key ? null : key)"
    />
  </div>

  <!-- Loading -->
  <div v-if="isLoading" class="flex justify-center py-12">
    <LoadingSpinner />
  </div>

  <!-- Empty state -->
  <div v-else-if="visibleEntries.length === 0" class="text-center py-16 space-y-3">
    <IconPopulate class="h-10 w-10 text-muted-foreground/30 mx-auto" />
    <p class="font-cinzel text-sm text-muted-foreground">Your journal is empty.</p>
    <p class="text-caption text-muted-foreground italic">Record your adventures, clues, and discoveries.</p>
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
        <span v-if="entry.ref_label" class="text-caption text-muted-foreground/70 italic truncate max-w-32">{{ entry.ref_label }}</span>
        <span
          class="inline-flex items-center gap-1 text-label"
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
              class="text-label px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
            >{{ tag }}</span>
          </div>
        </div>
        <div class="flex items-center gap-3 px-4 py-2 border-t border-border bg-muted/20">
          <AppButton variant="link" size="inline" @click="$emit('startEdit', entry)">Edit</AppButton>
          <AppButton variant="ghost" tone="danger" size="inline" class="text-muted-foreground/60" @click="$emit('removeEntry', entry)">Delete</AppButton>
        </div>
      </template>

      <!-- Edit mode -->
      <div v-else class="p-4 flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <AppSelect
            v-model="categoryModel"
            tone="muted"
            size="sm"
            :style="{ color: JOURNAL_CATEGORIES[editForm.category as JournalCategory]?.color }"
          >
            <option v-for="[key, cat] in JOURNAL_CATEGORY_LIST" :key="key" :value="key">{{ cat.label }}</option>
          </AppSelect>
          <AppInput
            v-model="titleModel"
            tone="underline"
            size="lg"
            :block="false"
            placeholder="Entry title (optional)…"
            class="flex-1 min-w-32 font-bold"
          />
        </div>
        <RichTextEditor
          :model-value="editForm.content"
          size="lg"
          allow-upload
          :entity-mention-items="mentionItems"
          @update:model-value="(v: string) => $emit('editFormChange', { content: v })"
        />
        <div class="flex flex-wrap items-center gap-2">
          <AppSelect v-model="refTypeModel" tone="muted" size="sm" class="text-muted-foreground">
            <option value="">No context</option>
            <option value="quest">Quest</option>
            <option value="npc">NPC</option>
            <option value="location">Location</option>
            <option value="item">Item</option>
            <option value="monster">Monster</option>
            <option value="encounter">Encounter</option>
          </AppSelect>
          <div v-if="editForm.ref_type" class="flex-1 min-w-32">
            <AppSelect v-model="refIdModel" tone="muted" size="body" block weight="normal">
              <option value="">— Select —</option>
              <option v-for="opt in editRefOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</option>
            </AppSelect>
          </div>
        </div>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 flex-wrap">
            <AppButton
              variant="subtle"
              :active="!editForm.is_private"
              :tone="editForm.is_private ? 'neutral' : 'success'"
              size="sm"
              :icon="editForm.is_private ? IconLock : IconReveal"
              icon-size="xs"
              :label="editForm.is_private ? 'Private' : 'Shared'"
              @click="$emit('editFormChange', { is_private: !editForm.is_private, shared_with_dm: editForm.is_private ? editForm.shared_with_dm : false })"
            />
            <AppCheckbox
              v-if="editForm.is_private"
              size="sm"
              accent="amber"
              label-role="label-lg"
              label-weight="normal"
          label-class="text-amber-600/80 dark:text-amber-400/80"
              label="Share with DM"
              :model-value="editForm.shared_with_dm"
              @update:model-value="$emit('editFormChange', { shared_with_dm: $event })"
            />
          </div>
          <div class="flex items-center gap-2">
            <AppButton variant="ghost" size="inline" @click="$emit('cancelEdit')">Cancel</AppButton>
            <AppButton
              variant="primary"
              size="sm"
              :icon="IconSave"
              :loading="saving"
              :disabled="isRteEmpty(editForm.content) || saving"
              @click="$emit('submitEdit')"
            >{{ saving ? 'Saving…' : 'Save' }}</AppButton>
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
import { IconDrag, IconLock, IconPopulate, IconReveal, IconSave } from '@/lib/icons';
import AppButton from '@/components/common/AppButton.vue';
import AppCheckbox from '@/components/common/AppCheckbox.vue';
import AppInput from '@/components/common/AppInput.vue';
import AppSelect from '@/components/common/AppSelect.vue';
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

// Writable bridges from the parent-owned `editForm` prop onto the child
// AppSelects, which require a v-model — each setter re-emits the same
// 'editFormChange' patch the native @change handlers used to.
const categoryModel = computed<JournalCategory>({
  get: () => editForm.category,
  set: (value) => emit('editFormChange', { category: value }),
});
const refTypeModel = computed<string>({
  get: () => editForm.ref_type,
  // Changing the reference type invalidates whatever was picked for it.
  set: (value) => emit('editFormChange', { ref_type: value, ref_id: '' }),
});
const refIdModel = computed<string>({
  get: () => editForm.ref_id,
  set: (value) => emit('editFormChange', { ref_id: value }),
});
const titleModel = computed<string>({
  get: () => editForm.title ?? '',
  set: (value) => emit('editFormChange', { title: value }),
});

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
