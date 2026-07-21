<template>
  <div class="flex items-center gap-1 pb-1 mb-4 border-b border-border/50">
    <!-- "All" virtual tab (pinned — stays visible while named tabs scroll) -->
    <button
      class="shrink-0 px-3 py-1 rounded-md text-xs font-cinzel tracking-wide transition-colors"
      :class="
        activePageId === null
          ? 'bg-gold-500/20 border border-gold-500/40 text-gold-300'
          : 'border border-transparent text-muted-foreground hover:text-foreground hover:border-border'
      "
      @click="activePageId = null"
    >
      All
    </button>

    <!-- Named page tabs (draggable) — scrolls horizontally when they overflow.
         Edge fades + chevron buttons cue (and trigger) the hidden tabs. -->
    <div class="relative flex-1 min-w-0">
      <!-- Left fade + scroll button -->
      <button
        v-show="canScrollLeft"
        type="button"
        class="absolute inset-y-0 left-0 z-10 flex items-center pr-4 pl-0.5 bg-linear-to-r from-card via-card/90 to-transparent text-muted-foreground hover:text-foreground transition-colors"
        title="Scroll left"
        @click="scrollByStep(-1)"
      >
        <IconChevronLeft class="h-3.5 w-3.5" />
      </button>

      <!-- Right fade + scroll button -->
      <button
        v-show="canScrollRight"
        type="button"
        class="absolute inset-y-0 right-0 z-10 flex items-center pl-4 pr-0.5 justify-end bg-linear-to-l from-card via-card/90 to-transparent text-muted-foreground hover:text-foreground transition-colors"
        title="Scroll right"
        @click="scrollByStep(1)"
      >
        <IconChevronRight class="h-3.5 w-3.5" />
      </button>

      <VueDraggable
        ref="scroller"
        v-model="orderedPages"
        class="flex items-center gap-1 overflow-x-auto scrollbar-none"
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
            activePageId === page.id
              ? 'bg-gold-500/20 border border-gold-500/40 text-gold-300'
              : 'border border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          "
          @click="activePageId = page.id"
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
    </div>

    <!-- Add page button -->
    <button
      class="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-border text-xs font-cinzel text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors relative"
      :title="canCreatePage ? 'Add page' : 'Pro feature — upgrade to create multiple soundboard pages'"
      @click="addPage"
    >
      <IconAdd class="h-3 w-3" />
      Add Page
      <span v-if="!canCreatePage" class="absolute -top-1.5 -right-1.5 px-1 rounded text-[0.5625rem] font-cinzel bg-amber-500 text-black leading-4">PRO</span>
    </button>
  </div>

  <PaywallModal v-model="showPagePaywall" resource="soundboard_pages" />
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import type { ComponentPublicInstance } from "vue";
import { IconAdd, IconChevronLeft, IconChevronRight, IconClose, IconDrag } from '@/lib/icons';
import { VueDraggable } from "vue-draggable-plus";
import {
  useCreateSoundboardPage,
  useUpdateSoundboardPage,
  useDeleteSoundboardPage,
  useReorderSoundboardPages,
} from "@/composables/useSoundboardPages";
import { useQuota } from "@/composables/useQuota";
import PaywallModal from "@/components/common/PaywallModal.vue";
import type { SoundboardPage } from "@/types/sound.types";

const activePageId = defineModel<string | null>({ required: true });
const { pages } = defineProps<{
  pages: SoundboardPage[];
}>();

const { mutate: createPage } = useCreateSoundboardPage();
const { mutate: updatePage } = useUpdateSoundboardPage();
const { mutate: deletePage_m } = useDeleteSoundboardPage();
const { mutate: reorderPages } = useReorderSoundboardPages();
const { canCreate: canCreatePage } = useQuota("soundboard_pages");
const showPagePaywall = ref(false);

// Local ordered copy for drag-and-drop
const orderedPages = ref<SoundboardPage[]>([]);

watch(
  () => pages,
  (newPages) => { orderedPages.value = [...newPages]; },
  { immediate: true },
);

function persistPageOrder() {
  const updates = orderedPages.value
    .map((p, index) => ({ id: p.id, sort_order: index }))
    .filter(({ id, sort_order }) => {
      const original = pages.find((p) => p.id === id);
      return original === undefined || original.sort_order !== sort_order;
    });
  reorderPages(updates);
}

// ── Overflow cues ───────────────────────────────────────────────────────────
// When the named tabs overflow their row, fade + chevron buttons appear on the
// scrollable edges so the DM knows there are more tabs (and can click to reach
// them). Recomputed on scroll, resize, and whenever the tab set changes.

const scroller = ref<ComponentPublicInstance | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

function scrollEl(): HTMLElement | undefined {
  return scroller.value?.$el as HTMLElement | undefined;
}

function updateScrollCues() {
  const el = scrollEl();
  if (!el) {
    canScrollLeft.value = false;
    canScrollRight.value = false;
    return;
  }
  // 1px tolerance: scrollWidth can be a hair larger than scrollLeft+clientWidth
  // at the extremes due to sub-pixel rounding, which would otherwise keep the
  // chevron visible at the very end.
  const maxScroll = el.scrollWidth - el.clientWidth;
  canScrollLeft.value = el.scrollLeft > 1;
  canScrollRight.value = el.scrollLeft < maxScroll - 1;
}

function scrollByStep(direction: 1 | -1) {
  scrollEl()?.scrollBy({ left: direction * 160, behavior: "smooth" });
}

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  updateScrollCues();
  const el = scrollEl();
  if (!el) return;
  el.addEventListener("scroll", updateScrollCues, { passive: true });
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => updateScrollCues());
    resizeObserver.observe(el);
  }
});

onBeforeUnmount(() => {
  scrollEl()?.removeEventListener("scroll", updateScrollCues);
  resizeObserver?.disconnect();
});

// ── Add ───────────────────────────────────────────────────────────────────

function addPage() {
  if (!canCreatePage.value) { showPagePaywall.value = true; return; }
  const nextOrder = (orderedPages.value.at(-1)?.sort_order ?? -1) + 1;
  createPage(
    { name: "New Page", sort_order: nextOrder },
    {
      onSuccess: (page) => {
        activePageId.value = page.id;
        // Open the title for editing, but the input only renders once the
        // refetched `pages` prop includes the new page — defer the focus until
        // it appears (see the orderedPages watcher below).
        editingId.value = page.id;
        nameDraft.value = page.name;
        awaitingFocusId.value = page.id;
      },
    },
  );
}

// ── Rename ────────────────────────────────────────────────────────────────

const editingId = ref<string | null>(null);
const nameDraft = ref("");
const renameInput = ref<HTMLInputElement | null>(null);
const awaitingFocusId = ref<string | null>(null);

function focusRenameInput() {
  nextTick(() => {
    const el = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value;
    el?.focus();
    el?.select();
  });
}

// Focus the rename input for a newly created page once its tab has rendered;
// also refresh the overflow cues since the tab set (and its width) changed.
watch(orderedPages, () => {
  if (awaitingFocusId.value && orderedPages.value.some((p) => p.id === awaitingFocusId.value)) {
    awaitingFocusId.value = null;
    focusRenameInput();
  }
  nextTick(updateScrollCues);
});

function startRename(page: SoundboardPage) {
  editingId.value = page.id;
  nameDraft.value = page.name;
  focusRenameInput();
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
      if (activePageId.value === id) {
        activePageId.value = null;
      }
    },
  });
}
</script>
