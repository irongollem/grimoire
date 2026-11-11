<template>
  <!-- The contents page as the layout prints it. It is made from the headings, so it has no text of its own
       to edit: it is selected, and the panel says where it comes from. `sc-toc` carries the look's rules. -->
  <!-- Read only (the phone reader, a handout) the node is the empty placeholder it always was there:
       the reader draws its own tappable list in its place. -->
  <NodeViewWrapper
    as="nav"
    data-type="toc"
    :class="editable ? 'sc-toc' : 'sc-toc-placeholder'"
    aria-label="Table of Contents"
    :data-block-id="props.node.attrs.blockId"
    contenteditable="false"
  >
    <template v-if="editable">
      <!-- eslint-disable-next-line vue/no-v-html -- markup the book's own layout wrote, from escaped heading text -->
      <div v-if="html" class="sc-toc-body" v-html="html" />
      <div v-else class="sc-toc-body">
        <h2 class="sc-toc-heading">Contents</h2>
        <p class="sc-toc-empty">No headings yet.</p>
      </div>
      <span class="sc-toc-note">Made from your headings. It updates as you write; to change an entry, change its heading.</span>
    </template>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed, inject, watch } from "vue";
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import { PRINTED_BOOK_KEY } from "@/scriptorium/composables/usePrintedBook";
import { remeasurePages } from "@/scriptorium/lib/remeasurePages";

const props = defineProps({ ...nodeViewProps });
// Without a book around it (a handout, a test) there is no layout to read: the empty page shows.
const editable = computed(() => props.editor.isEditable);
const printed = inject(PRINTED_BOOK_KEY, null);
const html = computed(() => printed?.contents.value ?? null);
// A new list changes how full this page is.
watch(html, () => remeasurePages(props.editor), { flush: "post" });
</script>

<style scoped>
.sc-toc-body {
  display: contents;
}
</style>
