<template>
  <div class="flex items-center gap-1 min-w-0 overflow-x-auto pb-1 mb-4 border-b border-border/50">
    <!-- "All" virtual tab -->
    <button
      class="shrink-0 px-3 py-1 rounded-md text-xs font-cinzel tracking-wide transition-colors"
      :class="
        modelValue === null
          ? 'bg-gold-500/20 border border-gold-500/40 text-gold-300'
          : 'border border-transparent text-muted-foreground hover:text-foreground hover:border-border'
      "
      @click="emit('update:modelValue', null)"
    >
      All
    </button>

    <!-- Named page tabs (draggable) -->
    <VueDraggable
      v-model="orderedPages"
      class="flex items-center gap-1"
      handle=".page-drag-handle"
      :animation="150"
      ghost-class="opacity-40"
      @end="persistPageOrder"
    >
      <div
        v-for="page in orderedPages"
        :key="page.id"
        class="group/tab flex items-center shrink-0"
      >
        <!-- Drag handle -->
        <div
          class="page-drag-handle cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60 pr-0.5 [@media(hover:hover)]:opacity-0 group-hover/tab:opacity-100 transition-opacity"
          title="Drag to reorder"
        >
          <IconDrag class="h-3 w-3" />
        </div>

        <!-- Tab button or inline rename input -->
        <input
          v-if="editingId === page.id"
          ref="renameInput"
          v-model="nameDraft"
          type="text"
          class="w-28 rounded border border-gold-500/50 bg-background px-2 py-0.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gold-500"
          @keydown.enter="saveRename(page.id)"
          @keydown.escape="cancelRename"
          @blur="saveRename(page.id)"
        />
        <button
          v-else
          class="px-3 py-1 rounded-md text-xs font-cinzel tracking-wide transition-colors"
          :class="
            modelValue === page.id
              ? 'bg-gold-500/20 border border-gold-500/40 text-gold-300'
              : 'border border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          "
          @click="emit('update:modelValue', page.id)"
          @dblclick="startRename(page)"
          :title="page.name + ' — double-click to rename'"
        >
          {{ page.name }}
        </button>

        <!-- Delete button (visible on hover, hidden for active page while only 1 exists) -->
        <button
          class="shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-destructive transition-colors [@media(hover:hover)]:opacity-0 group-hover/tab:opacity-100"
          title="Delete page"
          @click.stop="deletePage(page.id)"
        >
          <IconClose class="h-2.5 w-2.5" />
        </button>
      </div>
    </VueDraggable>

    <!-- Add page button -->
    <button
      class="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-border text-xs font-cinzel text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
      title="Add page"
      @click="addPage"
    >
      <IconAdd class="h-3 w-3" />
      Add Page
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { IconAdd, IconClose, IconDrag } from '@/lib/icons';
import { VueDraggable } from "vue-draggable-plus";
import {
  useCreateSoundboardPage,
  useUpdateSoundboardPage,
  useDeleteSoundboardPage,
  useReorderSoundboardPages,
} from "@/composables/useSoundboardPages";
import type { SoundboardPage } from "@/types/sound.types";

const { modelValue, pages } = defineProps<{
  modelValue: string | null;
  pages: SoundboardPage[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", pageId: string | null): void;
}>();

const { mutate: createPage } = useCreateSoundboardPage();
const { mutate: updatePage } = useUpdateSoundboardPage();
const { mutate: deletePage_m } = useDeleteSoundboardPage();
const { mutate: reorderPages } = useReorderSoundboardPages();

// Local ordered copy for drag-and-drop
const orderedPages = ref<SoundboardPage[]>([]);

watch(
  () => pages,
  (newPages) => { orderedPages.value = [...newPages]; },
  { immediate: true },
);

function persistPageOrder() {
  reorderPages(orderedPages.value.map((p) => p.id));
}

// ── Add ───────────────────────────────────────────────────────────────────

function addPage() {
  const nextOrder = (orderedPages.value.at(-1)?.sort_order ?? -1) + 1;
  createPage(
    { name: "New Page", sort_order: nextOrder },
    {
      onSuccess: (page) => {
        emit("update:modelValue", page.id);
        nextTick(() => startRename(page));
      },
    },
  );
}

// ── Rename ────────────────────────────────────────────────────────────────

const editingId = ref<string | null>(null);
const nameDraft = ref("");
const renameInput = ref<HTMLInputElement | null>(null);

function startRename(page: SoundboardPage) {
  editingId.value = page.id;
  nameDraft.value = page.name;
  nextTick(() => {
    if (Array.isArray(renameInput.value)) {
      renameInput.value[0]?.select();
    } else {
      renameInput.value?.select();
    }
  });
}

function saveRename(id: string) {
  const trimmed = nameDraft.value.trim();
  if (trimmed) {
    updatePage({ id, update: { name: trimmed } });
  }
  editingId.value = null;
}

function cancelRename() {
  editingId.value = null;
}

// ── Delete ────────────────────────────────────────────────────────────────

function deletePage(id: string) {
  deletePage_m(id, {
    onSuccess: () => {
      // If the deleted page was active, fall back to "All"
      if (modelValue === id) {
        emit("update:modelValue", null);
      }
    },
  });
}
</script>
