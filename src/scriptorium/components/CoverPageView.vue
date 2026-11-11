<template>
  <!-- The cover as it prints: the same markup coverPage.ts renders for the page, drawn straight into this
       box (so the art and the title stack position against it, and the phone reader's rules for the
       cover's children still find them), with its words marked as fields while it is being edited. -->
  <NodeViewWrapper
    ref="wrapper"
    as="div"
    data-type="coverPage"
    :data-variant="variant"
    :class="`sc-cover sc-cover--${variant}`"
    :data-block-id="props.node.attrs.blockId"
    contenteditable="false"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, useTemplateRef, watch } from "vue";
import { DOMSerializer, type DOMOutputSpec } from "@tiptap/pm/model";
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import {
  buildCoverInner,
  coverShade,
  type CoverPageAttrs,
  type CoverPageVariant,
  type CoverTextField,
} from "@/scriptorium/lib/coverMarkup";

const props = defineProps({ ...nodeViewProps });

const wrapper = useTemplateRef<{ $el: HTMLElement }>("wrapper");
const attrs = computed(() => props.node.attrs as CoverPageAttrs);
const variant = computed<CoverPageVariant>(() => attrs.value.variant ?? "front");

// What makes the cover a different drawing. A word typed does not: its field already shows it, and
// drawing the cover again under the caret would throw the caret away.
const drawingKey = computed(() => {
  const a = attrs.value;
  // Read only there is no caret to keep, so every word is part of the drawing.
  if (!props.editor.isEditable) return JSON.stringify(a);
  return JSON.stringify([a.variant, a.backgroundImage, a.titlePlace, coverShade(a)]);
});

function text(name: CoverTextField): string {
  const v = attrs.value[name];
  return typeof v === "string" ? v : "";
}

function write(name: CoverTextField, raw: string) {
  // A newline has no place in a title; a pasted one folds into a space.
  const value = raw.replace(/\s*\n\s*/g, " ");
  if (value !== text(name)) props.updateAttributes({ [name]: value });
}

/** The cover is where the panel looks for what to describe: typing on it selects it. */
function selectSelf() {
  const pos = props.getPos();
  if (typeof pos === "number") props.editor.commands.setNodeSelection(pos);
}

function wire(el: HTMLElement) {
  const name = el.dataset.field as CoverTextField;
  try {
    el.contentEditable = "plaintext-only";
  } catch {
    el.contentEditable = "true"; // older Firefox; paste below keeps it plain
  }
  el.addEventListener("input", () => write(name, el.textContent ?? ""));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.blur();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      // Chrome selects the whole chapter from a field nested in the editor; select-all stays in the word.
      e.preventDefault();
      window.getSelection()?.selectAllChildren(el);
    }
  });
  el.addEventListener("paste", (e) => {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData?.getData("text/plain") ?? "");
  });
  el.addEventListener("focus", selectSelf);
  // The cover is draggable, which keeps the mouse from selecting text inside it.
  const cover = () => el.closest<HTMLElement>("[data-type='coverPage']");
  el.addEventListener("mousedown", () => {
    const c = cover();
    if (c) c.draggable = false;
  });
  el.addEventListener("blur", () => {
    const c = cover();
    if (c) c.draggable = true;
  });
}

function draw() {
  const el = wrapper.value?.$el;
  if (!el) return;
  // Read only (the phone reader, a handout) the cover is just the printed one: no fields to type in.
  const editing = props.editor.isEditable;
  const spec = ["div", {}, ...buildCoverInner(variant.value, attrs.value, editing)] as DOMOutputSpec;
  const root = DOMSerializer.renderSpec(document, spec).dom as HTMLElement;
  root.querySelectorAll<HTMLElement>("[data-field]").forEach(wire);
  el.replaceChildren(...Array.from(root.childNodes));
}

/** An undo, or the same words on another part of the cover, changes a field that was not typed in. */
function syncText() {
  wrapper.value?.$el.querySelectorAll<HTMLElement>("[data-field]").forEach((el) => {
    const want = text(el.dataset.field as CoverTextField);
    if (el.textContent !== want) el.textContent = want;
  });
}

onMounted(draw);
watch(drawingKey, draw);
watch(attrs, syncText);
</script>
