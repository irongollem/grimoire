<template>
  <nav aria-label="Chapters" class="flex min-h-0 w-full flex-col border-r border-border">
    <h2 class="px-4.5 pt-3.5 pb-2 text-label font-bold text-primary">Chapters</h2>

    <ul class="min-h-0 flex-1 overflow-y-auto" ref="listRef">
      <ChapterRailRow
        v-for="(chapter, at) in chapters"
        :key="chapter.id"
        :chapter="chapter"
        :pages="pagesLine(pageRanges[chapter.id])"
        :current="chapter.id === currentId"
        :first="at === 0"
        :last="at === chapters.length - 1"
        :can-delete="chapters.length > 1"
        :can-reorder="chapters.length > 1"
        :dragging="drag?.id === chapter.id"
        :drop-before="indicator === `before:${at}`"
        :drop-after="indicator === `after:${at}`"
        @select="select(chapter.id)"
        @move-up="move(chapter.id, -1)"
        @move-down="move(chapter.id, 1)"
        @delete="remove(chapter)"
        @grip-down="startDrag(chapter.id, $event)"
      />
    </ul>

    <p v-if="errorText" class="mx-3.5 mb-2 text-caption text-destructive" role="alert">{{ errorText }}</p>

    <AppButton
      variant="outline"
      block
      class="mx-3.5 mt-2.5 mb-3.5 w-auto border-dashed max-md:min-h-11"
      :icon="IconAdd"
      icon-size="xs"
      label="Add chapter"
      :loading="createChapter.isPending.value"
      @click="add"
    />
  </nav>
</template>

<script setup lang="ts">
/**
 * The chapter rail (Scriptorium Chapters, frames 02, 03 and 05): one row per
 * chapter, named by its first heading, with where it falls in the book. Add,
 * move and delete live here; rename does not exist, because the title IS the
 * heading. The shell owns which chapter is open and saving; this component only
 * asks it to settle (`beforeLeave`) before the editor changes chapter.
 */
import { computed, ref, onBeforeUnmount } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import {
  useBookChaptersFull,
  useCreateChapter,
  useDeleteChapter,
  useReorderChapters,
} from "@/composables/scriptorium/useScriptoriumChapters";
import { useConfirm } from "@/composables/useConfirm";
import { removeRichTextImages } from "@/composables/useImageUpload";
import { IconAdd } from "@/lib/icons";
import { dropSlot, moveBy, moveToSlot, neighbourAfterDelete, pagesLine } from "@/lib/scriptorium/chapters/railOrder";
import type { ScriptoriumChapterSummary } from "@/types/scriptorium.types";
import ChapterRailRow from "./ChapterRailRow.vue";

const { documentId, chapters, currentId, pageRanges, beforeLeave } = defineProps<{
  documentId: string;
  chapters: ScriptoriumChapterSummary[];
  currentId: string;
  pageRanges: Record<string, { first: string | null; last: string | null }>;
  /** The shell's save-now: resolves when the open chapter is safe to leave, rejects (and shows why) when it is not. */
  beforeLeave: () => Promise<void>;
}>();

const emit = defineEmits<{ select: [chapterId: string] }>();

const { confirm } = useConfirm();
const createChapter = useCreateChapter();
const deleteChapter = useDeleteChapter();
const reorder = useReorderChapters();
// Only for the images of a chapter about to go: read on demand, never on mount.
const bodies = useBookChaptersFull(() => documentId, { enabled: false });

const errorText = ref<string | null>(null);
const listRef = ref<HTMLElement | null>(null);
const ids = computed(() => chapters.map((chapter) => chapter.id));

function message(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

async function select(id: string) {
  if (id === currentId) return;
  try {
    await beforeLeave();
  } catch {
    return; // the shell shows why it could not save; stay where the typing is
  }
  emit("select", id);
}

async function add() {
  errorText.value = null;
  let createdId: string;
  try {
    const created = await createChapter.mutateAsync({
      documentId,
      // An empty level-1 heading: the new chapter opens with its title ready to type.
      content: { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] },
    });
    createdId = created.id;
  } catch (e: unknown) {
    errorText.value = message(e, "Could not add the chapter.");
    return;
  }
  // A rejected beforeLeave is the shell's to explain; the chapter exists and the rail lists it.
  await select(createdId);
}

async function applyOrder(next: string[]) {
  if (next === ids.value) return;
  errorText.value = null;
  try {
    await reorder.mutateAsync({ documentId, orderedIds: next });
  } catch (e: unknown) {
    errorText.value = message(e, "Could not move the chapter.");
  }
}

function move(id: string, delta: -1 | 1) {
  void applyOrder(moveBy(ids.value, id, delta));
}

async function remove(chapter: ScriptoriumChapterSummary) {
  if (chapters.length <= 1) return; // a book keeps one chapter; the menu does not offer this either
  const title = chapter.title.trim() || "Untitled chapter";
  const words = chapter.word_count.toLocaleString();
  const confirmed = await confirm(`"${title}" and its ${words} words will be removed from the book. This cannot be undone.`, {
    title: "Delete Chapter?",
    confirmLabel: "Delete chapter",
    danger: true,
  });
  if (!confirmed) return;
  errorText.value = null;
  try {
    const body = (bodies.data.value ?? (await bodies.refetch({ throwOnError: true })).data)?.find((row) => row.id === chapter.id);
    const next = chapter.id === currentId ? neighbourAfterDelete(ids.value, chapter.id) : null;
    await deleteChapter.mutateAsync({ id: chapter.id, documentId });
    if (body) removeRichTextImages(JSON.stringify(body.content));
    if (next) emit("select", next);
  } catch (e: unknown) {
    errorText.value = message(e, "Could not delete the chapter.");
  }
}

// --- Dragging the grip. Pointer events on the window, so the drag survives leaving the rail.
const drag = ref<{ id: string; slot: number } | null>(null);

const indicator = computed(() => {
  if (!drag.value) return null;
  if (moveToSlot(ids.value, drag.value.id, drag.value.slot) === ids.value) return null;
  return drag.value.slot >= chapters.length ? `after:${chapters.length - 1}` : `before:${drag.value.slot}`;
});

function slotAt(y: number): number {
  const rows = Array.from(listRef.value?.querySelectorAll<HTMLElement>("[data-chapter-row]") ?? []);
  return dropSlot(
    rows.map((row) => {
      const rect = row.getBoundingClientRect();
      return rect.top + rect.height / 2;
    }),
    y,
  );
}

function onMove(event: PointerEvent) {
  if (drag.value) drag.value = { ...drag.value, slot: slotAt(event.clientY) };
}
function onUp(event: PointerEvent) {
  const current = drag.value;
  stopDrag();
  if (current) void applyOrder(moveToSlot(ids.value, current.id, slotAt(event.clientY)));
}
function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") stopDrag();
}
function stopDrag() {
  drag.value = null;
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  window.removeEventListener("pointercancel", stopDrag);
  window.removeEventListener("keydown", onKey);
}
function startDrag(id: string, event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  drag.value = { id, slot: ids.value.indexOf(id) };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", stopDrag);
  window.addEventListener("keydown", onKey);
}
onBeforeUnmount(stopDrag);
</script>
