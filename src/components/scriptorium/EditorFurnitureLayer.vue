<template>
  <!-- Furniture in front of the text (and the selected item, whatever its layer)
       is drawn here, above the editor; art behind the text is drawn by the same
       code into the editor's own underlay (FurnitureUnderlay). The layer takes
       no pointer events itself: the items do, so the text stays writable. -->
  <div ref="overlayRef" class="sc-editor-furniture" aria-hidden="true" />
</template>

<script setup lang="ts">
/**
 * Page furniture on the chapter editor's real pages (#1175).
 *
 * Imperative on purpose, like the preview's render pass: the elements are the
 * ones `buildFurnitureElement` makes, so the editor and the preview draw an
 * item identically. A redraw happens when the furniture, the selection or the
 * page boxes change; a drag is committed on pointer-up, so nothing is redrawn
 * under the pointer.
 */
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Editor } from "@tiptap/core";
import type { PageFurnitureItem } from "@/types/scriptorium.types";
import type { PageFlowStorage } from "@/lib/tiptap/pageFlow";
import type { FurnitureUnderlayStorage } from "@/lib/tiptap/furnitureUnderlay";
import { buildFurnitureElement, makeGrabbable } from "@/lib/scriptorium/furniture/renderFurniture";
import { itemsByPage, pageRect, type SheetGeometry } from "@/lib/scriptorium/furniture/editorPages";

const { editor, chapterId, furniture, selectedId, geometry } = defineProps<{
  editor: Editor | null | undefined;
  chapterId: string;
  furniture: PageFurnitureItem[];
  selectedId: string | null;
  geometry: SheetGeometry;
}>();

/** The editor's own storage entries; the extensions are registered only in the chapter editor. */
function storageOf(ed: Editor) {
  return ed.storage as unknown as { pageFlow?: PageFlowStorage; furnitureUnderlay?: FurnitureUnderlayStorage };
}

const overlayRef = ref<HTMLElement | null>(null);
const PAGE_CLASS = "sc-editor-furniture-page";

function pageBox(rect: ReturnType<typeof pageRect>): HTMLElement {
  const box = document.createElement("div");
  box.className = PAGE_CLASS;
  box.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none`;
  return box;
}

function blockPositions(ed: Editor): Map<string, number> {
  const byId = new Map<string, number>();
  ed.state.doc.descendants((node, pos) => {
    const id: unknown = node.attrs.blockId;
    if (typeof id === "string" && !byId.has(id)) byId.set(id, pos);
  });
  return byId;
}

/** Bumped when the furniture, selection, chapter or geometry change: the inputs a measure alone cannot. */
let inputs = 0;
/** What the last draw drew: the page measure runs after every keystroke, and most of them move no picture. */
let drawn = "";

function draw() {
  const overlay = overlayRef.value;
  const ed = editor;
  if (!overlay || !ed || ed.isDestroyed) return;
  const underlay = storageOf(ed).furnitureUnderlay?.element ?? null;

  // Write mode has no pages, so there is nothing to draw furniture on.
  const flow = storageOf(ed).pageFlow;
  const pages = flow?.pages ?? [];
  const blocks = blockPositions(ed);
  const grouped = itemsByPage(furniture, chapterId, pages, (id) => blocks.get(id) ?? null);
  const signature = [
    inputs,
    underlay ? 1 : 0,
    ...[...grouped].map(([page, items]) => `${page.page}@${page.contentTop}:${items.map((i) => i.id).join(",")}`),
  ].join("|");
  if (signature === drawn) return;
  drawn = signature;
  overlay.replaceChildren();
  underlay?.replaceChildren();

  for (const [page, items] of grouped) {
    const rect = pageRect(page, geometry);
    const front = pageBox(rect);
    const behind = pageBox(rect);
    for (const item of items) {
      const el = buildFurnitureElement(item);
      const selected = item.id === selectedId;
      if (item.z === "under" && !selected) {
        // Behind the text and out of reach: select it from the preview or the inspector to move it.
        behind.appendChild(el);
      } else {
        makeGrabbable(el, item, selected);
        front.appendChild(el);
      }
    }
    if (front.childElementCount) overlay.appendChild(front);
    if (behind.childElementCount && underlay) underlay.appendChild(behind);
  }
}

let flow: PageFlowStorage | undefined;
let underlay: FurnitureUnderlayStorage | undefined;
function subscribe(ed: Editor | null | undefined) {
  unsubscribe();
  if (!ed) return;
  flow = storageOf(ed).pageFlow;
  underlay = storageOf(ed).furnitureUnderlay;
  flow?.listeners.add(draw);
  underlay?.listeners.add(draw);
  draw();
}
function unsubscribe() {
  flow?.listeners.delete(draw);
  underlay?.listeners.delete(draw);
  flow = undefined;
  underlay = undefined;
}

onMounted(() => subscribe(editor));
watch(() => editor, subscribe);
watch(
  () => [furniture, selectedId, chapterId, geometry] as const,
  () => {
    inputs++;
    draw();
  },
  { flush: "post" },
);
onBeforeUnmount(unsubscribe);
</script>
