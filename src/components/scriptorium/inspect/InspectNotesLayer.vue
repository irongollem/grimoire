<template>
  <div hidden data-inspect-notes-layer>
    <!--
      Pins and blank-page labels are teleported INTO the page elements the layout made, so they
      scroll, zoom and sit in spreads exactly as their page does; nothing has to be measured again
      when the shell changes the view. They exist only while this layer is mounted, so the book the
      export serialises never carries one (the layer is Inspect-only, and data-inspect-overlay marks
      every node it adds).
    -->
    <Teleport v-for="blank in blankLabels" :key="`blank-${blank.index}`" :to="blank.el">
      <div data-inspect-overlay class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-10">
        <p class="max-w-56 rounded-sm border border-dashed border-black/30 px-4 py-3.5 text-center text-label-lg leading-snug text-black/60">
          Left blank so {{ blank.next }} opens on a right-hand page. This note is not printed.
        </p>
      </div>
    </Teleport>

    <Teleport v-for="pin in pins" :key="pin.note.id" :to="pin.el">
      <InspectNotePin
        data-inspect-overlay
        :pin-id="pin.note.id"
        :n="pin.n"
        :top="pin.placement.top"
        :stack="pin.placement.slot"
        :open="openId === pin.note.id"
        :done="pin.note.done"
        @click.stop="toggle(pin.note.id)"
      />
    </Teleport>

    <Teleport v-if="draft" :to="draft.el">
      <InspectNotePin
        data-inspect-overlay
        pin-id="draft"
        :top="draft.top"
        :stack="draft.slot"
        :open="openId === DRAFT"
        @click.stop="toggle(DRAFT)"
      />
    </Teleport>

    <InspectNotePopover
      v-if="openId !== null && anchor && (openId === DRAFT || openNote)"
      :key="openId"
      :note="openId === DRAFT ? null : openNote"
      :anchor="anchor"
      :busy="busy"
      :error="errorText"
      @save="onSave"
      @close="close"
      @edit-block="onEditBlock"
      @toggle-done="onToggleDone"
      @delete="onDelete"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Notes on top of the laid-out book (Scriptorium Chapters, frame 04). The shell
 * lays the book out once into `host`; this layer reads the pages there, pins the
 * DM's notes to the blocks they were written on, and starts a new one where the
 * DM clicks. It never writes into the layout.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useBookNotes, useCreateNote, useDeleteNote, useUpdateNote } from "@/composables/scriptorium/useScriptoriumNotes";
import { noteTargetForClick, numberNotes, placeNotes } from "@/lib/scriptorium/inspect/notePlacement";
import { clearInspectPlacements, inspectNotesState } from "@/lib/scriptorium/inspect/notesState";
import { probePages, topBlockOf, type ProbedPage } from "@/lib/scriptorium/inspect/probePages";
import type { BookLayoutResult } from "@/lib/scriptorium/bookLayout/types";
import type { ScriptoriumChapterSummary } from "@/types/scriptorium.types";
import InspectNotePin from "./InspectNotePin.vue";
import InspectNotePopover from "./InspectNotePopover.vue";

const { documentId, host, result, chapters } = defineProps<{
  documentId: string;
  host: HTMLElement;
  /** A new object after every render: the cue to read the pages again. */
  result: BookLayoutResult;
  chapters: ScriptoriumChapterSummary[];
}>();

const emit = defineEmits<{ editBlock: [target: { chapterId: string; blockId: string }] }>();

const DRAFT = "draft";

const state = inspectNotesState(documentId);
const notesQuery = useBookNotes(() => documentId);
const createNote = useCreateNote();
const updateNote = useUpdateNote();
const deleteNote = useDeleteNote();

const pages = shallowRef<ProbedPage[]>([]);
const notes = computed(() => notesQuery.data.value ?? []);

interface Draft {
  chapterId: string;
  blockId: string;
  el: HTMLElement;
  top: number;
  slot: number;
}
const draft = ref<Draft | null>(null);
const openId = ref<string | null>(null);
const anchor = shallowRef<HTMLElement | null>(null);
const errorText = ref<string | null>(null);

const busy = computed(() => createNote.isPending.value || updateNote.isPending.value || deleteNote.isPending.value);

function sync() {
  pages.value = probePages(host);
  state.placements.value = placeNotes(
    notes.value,
    pages.value.map((page) => page.probe),
  );
  void findAnchor();
}

const pins = computed(() =>
  numberNotes(notes.value, chapters, state.placements.value, state.showDone.value).flatMap(({ note, n }) => {
    const placement = state.placements.value.get(note.id);
    const el = placement?.pageIndex == null ? undefined : pages.value[placement.pageIndex]?.el;
    return placement && el ? [{ note, n, placement, el }] : [];
  }),
);

const blankLabels = computed(() =>
  pages.value.flatMap(({ el, probe }) => {
    if (!probe.blank) return [];
    const at = chapters.findIndex((chapter) => chapter.id === probe.chapterId);
    const next = at === -1 ? undefined : chapters[at + 1];
    return [{ index: probe.index, el, next: next ? next.title.trim() || "the next chapter" : "the next chapter" }];
  }),
);

const openNote = computed(() => notes.value.find((note) => note.id === openId.value) ?? null);

async function findAnchor() {
  await nextTick();
  if (openId.value === null) {
    anchor.value = null;
    return;
  }
  const id = openId.value;
  anchor.value =
    Array.from(host.querySelectorAll<HTMLElement>("[data-inspect-pin]")).find((pin) => pin.dataset.inspectPinId === id) ?? null;
}

function open(id: string) {
  errorText.value = null;
  openId.value = id;
  void findAnchor();
}
function close() {
  openId.value = null;
  anchor.value = null;
  draft.value = null;
  errorText.value = null;
}
function toggle(id: string) {
  if (openId.value === id) close();
  else {
    if (id !== DRAFT) draft.value = null;
    open(id);
  }
}

function onHostClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest("[data-inspect-pin]")) return;
  const pageEl = target.closest<HTMLElement>(".pagedjs_page");
  if (!pageEl) return;
  sync();
  const page = pages.value.find((candidate) => candidate.el === pageEl);
  if (!page) return;
  const clicked = topBlockOf(target)?.getAttribute("data-block-id") ?? null;
  const hit = noteTargetForClick(page.probe, clicked);
  if (!hit) return;
  const block = page.probe.blocks.find((candidate) => candidate.id === hit.blockId);
  // noteTargetForClick only names a block it found on this page.
  if (!block) return;
  const slot = notes.value.filter((note) => state.placements.value.get(note.id)?.blockId === hit.blockId).length;
  draft.value = { ...hit, el: page.el, top: block.top, slot };
  open(DRAFT);
}

async function onSave(body: string) {
  errorText.value = null;
  try {
    if (openId.value === DRAFT && draft.value) {
      await createNote.mutateAsync({ documentId, chapterId: draft.value.chapterId, blockId: draft.value.blockId, body });
    } else if (openNote.value) {
      await updateNote.mutateAsync({ id: openNote.value.id, body });
    }
    close();
  } catch (e: unknown) {
    errorText.value = e instanceof Error ? e.message : "Could not save the note.";
  }
}

async function onToggleDone() {
  const note = openNote.value;
  if (!note) return;
  try {
    await updateNote.mutateAsync({ id: note.id, done: !note.done });
    close();
  } catch (e: unknown) {
    errorText.value = e instanceof Error ? e.message : "Could not update the note.";
  }
}

async function onDelete() {
  const note = openNote.value;
  if (!note) return;
  try {
    await deleteNote.mutateAsync({ id: note.id, documentId });
    close();
  } catch (e: unknown) {
    errorText.value = e instanceof Error ? e.message : "Could not delete the note.";
  }
}

function onEditBlock() {
  const note = openNote.value;
  if (!note?.block_id) return;
  emit("editBlock", { chapterId: note.chapter_id, blockId: note.block_id });
  close();
}

watch([() => result, () => chapters, notes], sync, { flush: "post" });
watch(
  () => state.focusNoteId.value,
  (id) => {
    if (id === null) return;
    state.focusNoteId.value = null;
    if (notes.value.some((note) => note.id === id)) {
      draft.value = null;
      open(id);
    }
  },
);

let resizeObserver: ResizeObserver | null = null;
let frame = 0;
onMounted(() => {
  sync();
  host.addEventListener("click", onHostClick);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    });
    resizeObserver.observe(host);
  }
});
onBeforeUnmount(() => {
  host.removeEventListener("click", onHostClick);
  resizeObserver?.disconnect();
  cancelAnimationFrame(frame);
  clearInspectPlacements(documentId);
});

defineExpose({ sync });
</script>
