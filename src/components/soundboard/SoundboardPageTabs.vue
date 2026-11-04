<template>
  <!-- No margins or borders of its own: it sits in the deck header's row and
       standalone spacing here would push it out of line with its row-mates. -->
  <div class="flex min-w-0 items-center gap-1">
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
        class="group/tab flex items-center shrink-0 rounded-md"
        :class="dropRing(page.id)"
        :data-page-drop="page.id"
        @dragover="onTabDragOver($event, page.id)"
        @dragleave="onTabDragLeave(page.id)"
        @drop="onTabDrop($event, page.id)"
      >
        <!-- Drag handle -->
        <div
          class="page-drag-handle cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60 pr-0.5 [@media(hover:hover)]:opacity-0 group-hover/tab:opacity-100 transition-opacity"
          title="Drag to reorder"
        >
          <IconDrag class="h-3 w-3" />
        </div>

        <!-- Tab button or inline rename input -->
        <AppInput
          v-if="editingId === page.id"
          ref="renameInput"
          v-model="nameDraft"
          size="xs"
          class="w-28 border-gold-500/50 focus:ring-gold-500"
          @keydown.enter="saveRename(page.id)"
          @keydown.escape="cancelRename"
          @blur="saveRename(page.id)"
        />
        <AppButton
          v-else
          :variant="activePageId === page.id ? 'tinted' : 'subtle'"
          tone="primary"
          emphasis="strong"
          size="sm"
          :label="page.name"
          :tooltip="page.name + ' (double-click to rename)'"
          :class="activePageId === page.id ? '' : 'border-transparent hover:border-border'"
          @click="activePageId = page.id"
          @dblclick="startRename(page)"
        />

        <!-- Delete button (visible on hover, hidden for active page while only 1 exists) -->
        <AppButton
          variant="ghost"
          tone="danger"
          size="inline-xs"
          icon-size="xs"
          :icon="IconClose"
          tooltip="Delete page"
          class="shrink-0 [@media(hover:hover)]:opacity-0 group-hover/tab:opacity-100"
          @click.stop="deletePage(page.id)"
        />
      </div>
      </VueDraggable>
    </div>

    <!-- Add page button -->
    <AppButton
      variant="subtle"
      size="sm"
      :icon="IconAdd"
      :tooltip="canCreatePage ? 'Add page' : 'Pro feature: upgrade to create multiple soundboard pages'"
      class="shrink-0 border-dashed"
      @click="addPage"
    >
      Add page
      <ProBadge v-if="!canCreatePage" />
    </AppButton>
  </div>

  <PaywallModal v-model="showPagePaywall" resource="soundboard_pages" />
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import type { ComponentPublicInstance } from "vue";
import { IconAdd, IconChevronLeft, IconChevronRight, IconClose, IconDrag } from '@/lib/icons';
import { VueDraggable } from "vue-draggable-plus";
import AppButton from "@/components/common/controls/AppButton.vue";
import ProBadge from "@/components/billing/ProBadge.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import {
  useCreateSoundboardPage,
  useUpdateSoundboardPage,
  useDeleteSoundboardPage,
  useReorderSoundboardPages,
} from "@/composables/soundboard/useSoundboardPages";
import { useConfirm } from "@/composables/useConfirm";
import { useQuota } from "@/composables/billing/useQuota";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import type { SoundboardPage } from "@/types/sound.types";

const activePageId = defineModel<string | null>({ required: true });
const { pages, padCounts = {} } = defineProps<{
  pages: SoundboardPage[];
  /** Pads on each page by page id, so deleting a page that holds some can ask first. */
  padCounts?: Readonly<Record<string, number>>;
}>();

const emit = defineEmits<{
  /** A pad was dropped on a tab: the view picks the slot, since it knows the pads. */
  padDrop: [payload: { pageId: string; padId: string }];
}>();

// ── Pads dropped on a tab ───────────────────────────────────────────────────
// Only a pad is accepted here. A tab used to take sounds too; a sound now lives
// in the library and goes onto a slot, so dragging one over a tab does nothing.
const PAD_TYPE = "application/x-grimoire-pad";
const overId = ref<string | null>(null);

function carriesPad(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(PAD_TYPE) === true;
}
function onTabDragOver(event: DragEvent, id: string) {
  if (!carriesPad(event)) return;
  event.preventDefault();
  overId.value = id;
}
function onTabDragLeave(id: string) {
  if (overId.value === id) overId.value = null;
}
function onTabDrop(event: DragEvent, pageId: string) {
  overId.value = null;
  if (!carriesPad(event)) return;
  event.preventDefault();
  const padId = event.dataTransfer?.getData(PAD_TYPE);
  if (padId) emit("padDrop", { pageId, padId });
}
function dropRing(id: string): string {
  return overId.value === id ? "ring-2 ring-gold-400 bg-gold-500/20" : "";
}

const { mutate: createPage } = useCreateSoundboardPage();
const { mutate: updatePage } = useUpdateSoundboardPage();
const { mutate: deletePage_m } = useDeleteSoundboardPage();
const { mutate: reorderPages } = useReorderSoundboardPages();
const { canCreate: canCreatePage } = useQuota("soundboard_pages");
const showPagePaywall = ref(false);
const { confirm } = useConfirm();

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
// AppInput exposes { el, focus, select } rather than the raw element, since a
// bare component ref resolves to the public instance, not the DOM node.
const renameInput = ref<{ focus: () => void; select: () => void } | null>(null);
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

async function deletePage(id: string) {
  // A page's pads go with it, so a page that holds some asks first.
  const held = padCounts[id] ?? 0;
  if (held > 0) {
    const ok = await confirm(
      `This page holds ${held} ${held === 1 ? "pad" : "pads"}. They come off the deck; the sounds stay in your library.`,
      { title: "Delete this page?", confirmLabel: "Delete page" },
    );
    if (!ok) return;
  }
  deletePage_m(id, {
    onSuccess: () => {
      // The deck shows the first page when none is chosen.
      if (activePageId.value === id) {
        activePageId.value = null;
      }
    },
  });
}
</script>
