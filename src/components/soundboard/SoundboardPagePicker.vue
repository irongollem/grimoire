<template>
  <!-- The phone's page picker. A tab strip is unusable at phone width: the
       names truncate under the scroll fades, and the drag handle and delete
       cross on every tab (always shown, as there is no hover) crowd them out.
       So the phone shows one control the full width of its row, naming the page
       on screen, and every page action lives in a sheet with room for thumbs. -->
  <div class="min-w-0">
  <AppButton
    variant="subtle"
    size="md"
    :icon="IconLayers"
    :icon-right="IconChevronDown"
    block
    class="min-w-0 justify-between"
    :aria-label="`Page: ${activeName}. Choose a page`"
    @click="open = true"
  >
    <span class="min-w-0 flex-1 truncate text-left text-foreground">{{ activeName }}</span>
    <span v-if="orderedPages.length > 1" class="shrink-0 text-caption text-muted-foreground">
      {{ activeIndex + 1 }}/{{ orderedPages.length }}
    </span>
  </AppButton>

  <MobileSheet v-model:open="open" title="Pages">
    <VueDraggable
      v-model="orderedPages"
      tag="ul"
      class="flex flex-col gap-1"
      handle=".page-drag-handle"
      :animation="150"
      ghost-class="opacity-40"
      aria-label="Pages"
      @end="persistPageOrder"
    >
      <li v-for="page in orderedPages" :key="page.id" class="flex min-w-0 items-center gap-1" :data-page="page.id">
        <div
          class="page-drag-handle flex h-11 w-8 shrink-0 touch-none items-center justify-center text-muted-foreground/60"
          aria-hidden="true"
        >
          <IconDrag class="h-4 w-4" />
        </div>

        <form v-if="editingId === page.id" class="flex min-w-0 flex-1 items-center gap-1" @submit.prevent="saveRename(page.id)">
          <AppInput
            ref="renameInput"
            v-model="nameDraft"
            size="md"
            block
            aria-label="Page name"
            @keydown.escape="editingId = null"
            @blur="saveRename(page.id)"
          />
          <AppButton type="submit" variant="ghost" size="icon-sm" :icon="IconCheck" aria-label="Save name" />
        </form>

        <template v-else>
          <AppButton
            variant="menu"
            size="md"
            :active="page.id === activePageId"
            class="min-w-0 flex-1"
            :aria-current="page.id === activePageId ? 'page' : undefined"
            @click="choose(page.id)"
          >
            <span class="min-w-0 flex-1 truncate">{{ page.name }}</span>
            <span class="shrink-0 text-caption text-muted-foreground">{{ padLabel(page.id) }}</span>
          </AppButton>
          <AppButton
            variant="ghost"
            size="icon-sm"
            :icon="IconPencilLine"
            :aria-label="`Rename ${page.name}`"
            @click="startRename(page)"
          />
          <AppButton
            variant="ghost"
            tone="danger"
            size="icon-sm"
            :icon="IconDelete"
            :aria-label="`Delete ${page.name}`"
            @click="deletePage(page.id)"
          />
        </template>
      </li>
    </VueDraggable>

    <template #footer>
      <AppButton variant="subtle" size="md" block :icon="IconAdd" class="border-dashed" @click="add">
        Add page
        <ProBadge v-if="!canCreatePage" />
      </AppButton>
    </template>
  </MobileSheet>

  <PaywallModal v-model="showPagePaywall" resource="soundboard_pages" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { IconAdd, IconCheck, IconChevronDown, IconDelete, IconDrag, IconLayers, IconPencilLine } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import MobileSheet from "@/components/common/overlays/MobileSheet.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import ProBadge from "@/components/billing/ProBadge.vue";
import { useSoundboardPageActions } from "@/composables/soundboard/useSoundboardPageActions";
import type { SoundboardPage } from "@/types/sound.types";

const activePageId = defineModel<string | null>({ required: true });
const { pages, padCounts = {} } = defineProps<{
  pages: SoundboardPage[];
  /** Pads on each page by page id: shown beside each name, and deleting a page that holds some asks first. */
  padCounts?: Readonly<Record<string, number>>;
}>();

const { orderedPages, persistPageOrder, addPage, renamePage, deletePage, canCreatePage, showPagePaywall } =
  useSoundboardPageActions({ pages: () => pages, padCounts: () => padCounts, activePageId });

const open = ref(false);

// The deck shows the first page when none is chosen, so the label does too.
const activeIndex = computed(() => Math.max(0, orderedPages.value.findIndex((p) => p.id === activePageId.value)));
const activeName = computed(() => orderedPages.value[activeIndex.value]?.name ?? "Pages");

function padLabel(id: string): string {
  const n = padCounts[id] ?? 0;
  return n === 1 ? "1 pad" : `${n} pads`;
}

function choose(id: string) {
  activePageId.value = id;
  open.value = false;
}

// ── Rename ────────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null);
const nameDraft = ref("");
const renameInput = ref<{ focus: () => void; select: () => void } | null>(null);
// A new page's row renders only once the refetched `pages` include it.
const awaitingFocusId = ref<string | null>(null);

function focusRenameInput() {
  nextTick(() => {
    const el = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value;
    el?.focus();
    el?.select();
  });
}

function startRename(page: SoundboardPage) {
  editingId.value = page.id;
  nameDraft.value = page.name;
  focusRenameInput();
}

function saveRename(id: string) {
  if (editingId.value !== id) return; // submit then blur: save once
  renamePage(id, nameDraft.value);
  editingId.value = null;
}

function add() {
  addPage((page) => {
    editingId.value = page.id;
    nameDraft.value = page.name;
    awaitingFocusId.value = page.id;
  });
}

watch(orderedPages, () => {
  if (awaitingFocusId.value && orderedPages.value.some((p) => p.id === awaitingFocusId.value)) {
    awaitingFocusId.value = null;
    focusRenameInput();
  }
});
</script>
