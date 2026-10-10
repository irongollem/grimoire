<template>
  <div class="rte-content" @click="onContentClick">
    <RenderedDoc />

    <!-- Image lightbox -->
    <Teleport to="body">
      <div
        v-if="lightboxSrc"
        class="fixed inset-0 z-200 flex items-center justify-center bg-black/80 p-4 cursor-zoom-out"
        @click="lightboxSrc = null"
      >
        <img
          :src="lightboxSrc"
          class="max-w-full max-h-full rounded-lg shadow-2xl object-contain cursor-default"
          @click.stop
        />
        <button
          type="button"
          class="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none transition-colors"
          @click="lightboxSrc = null"
        >
          ✕
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref, shallowRef, watch } from "vue";
import { parseStoredContent, renderStoredDoc } from "@/lib/tiptap/viewerRender";
import { usePendingImageDocResolver } from "@/composables/usePendingImageResolver";

// Rendered straight from the stored JSON, with no Tiptap editor. This
// component has ~64 call sites and nearly all of them only display rich text,
// so building a read-only editor here made every such page download
// ProseMirror and every extension. See `viewerRender.ts`. Mention, calendar
// and illustration chips are the same Vue components the editor mounts as
// node views; a mention carries no name (#932 story 3) and `EntityMentionChip`
// resolves it itself, so nothing here needs per-viewer wiring.

const props = defineProps<{ content: object | string | null }>();

const doc = shallowRef<unknown>(parseStoredContent(props.content));
const RenderedDoc = () => renderStoredDoc(doc.value);

// Chronicle-image anchors resolve here too, not only in the editor: a note
// saved while its render job was still in flight keeps the anchor in its
// persisted content, and the read-only view swaps it for the finished image
// in-memory the moment the job settles (persistence stays edit-save's job —
// ready job rows survive as the gallery, so nothing is lost by not writing).
let unmounted = false;
const pendingImageResolver = usePendingImageDocResolver(
  () => (unmounted ? null : doc.value),
  (next) => {
    doc.value = next;
  },
);

watch(
  () => props.content,
  (v) => {
    doc.value = parseStoredContent(v);
    pendingImageResolver.scan();
  },
  { immediate: true },
);

onUnmounted(() => {
  unmounted = true;
});

// ── Image lightbox ────────────────────────────────────────────────────────────
const lightboxSrc = ref<string | null>(null);

function onContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.tagName === "IMG") {
    lightboxSrc.value = (target as HTMLImageElement).src;
  }
}
</script>

<style scoped>
@reference "@/assets/main.css";

/* Tiptap injects these base rules when it creates an editor; with no editor
   here they are restated, or whitespace and hard-wrapped words would render
   differently from every page that does mount one. */
.rte-content :deep(.ProseMirror) {
  @apply text-body text-foreground outline-none;
  word-wrap: break-word;
  white-space: break-spaces;
  font-variant-ligatures: none;
  font-feature-settings: "liga" 0;
}
.rte-content :deep(.ProseMirror [contenteditable="false"]) {
  white-space: normal;
}
.rte-content :deep(.ProseMirror pre) {
  white-space: pre-wrap;
}
.rte-content :deep(.ProseMirror p) {
  @apply mb-3 leading-relaxed last:mb-0;
}
.rte-content :deep(.ProseMirror h1) {
  @apply text-heading font-bold mb-3 mt-5 first:mt-0;
}
.rte-content :deep(.ProseMirror h2) {
  @apply text-heading-sm font-bold mb-2 mt-4 first:mt-0 pb-1.5;
  border-bottom: 1px solid rgba(201, 146, 10, 0.35);
}
.rte-content :deep(.ProseMirror h3) {
  @apply text-heading-sm font-bold mb-2 mt-3 first:mt-0;
}
.rte-content :deep(.ProseMirror ul) {
  @apply list-disc pl-5 mb-3 space-y-1;
}
.rte-content :deep(.ProseMirror ol) {
  @apply list-decimal pl-5 mb-3 space-y-1;
}
.rte-content :deep(.ProseMirror blockquote) {
  @apply border-l-2 border-primary/50 pl-4 italic text-muted-foreground my-3;
}
.rte-content :deep(.ProseMirror table) {
  @apply w-full border-collapse my-3 text-sm;
}
.rte-content :deep(.ProseMirror th),
.rte-content :deep(.ProseMirror td) {
  @apply border border-border px-3 py-1.5 text-left align-top;
}
.rte-content :deep(.ProseMirror th) {
  @apply text-label-lg font-semibold bg-muted/50 text-foreground;
}
.rte-content :deep(.ProseMirror img) {
  @apply max-w-full rounded-md my-2 cursor-zoom-in;
}
.rte-content :deep(.ProseMirror u) {
  @apply underline;
}
.rte-content :deep(.ProseMirror mark) {
  @apply bg-tone-caution/25 text-foreground rounded-sm px-0.5;
}
.rte-content :deep(.ProseMirror a) {
  @apply text-primary underline cursor-pointer;
}
.rte-content :deep(.ProseMirror a:hover) {
  @apply opacity-80;
}
.rte-content :deep(.ProseMirror ul[data-type="taskList"]) {
  @apply list-none pl-1 mb-3 space-y-1;
}
.rte-content :deep(.ProseMirror li[data-type="taskItem"]) {
  @apply flex items-start gap-2;
}
.rte-content :deep(.ProseMirror li[data-type="taskItem"] > label) {
  @apply flex items-center pt-0.5 shrink-0;
}
.rte-content
  :deep(
    .ProseMirror li[data-type="taskItem"] > label > input[type="checkbox"]
  ) {
  @apply w-3.5 h-3.5 accent-primary cursor-pointer;
}
.rte-content
  :deep(.ProseMirror li[data-type="taskItem"][data-checked="true"] > div) {
  @apply line-through text-muted-foreground;
}
.rte-content :deep(.ProseMirror [data-type="columns"]) {
  column-count: 2;
  column-gap: 1.75rem;
  column-rule: 1px solid hsl(var(--border));
  @apply my-3;
}
</style>
