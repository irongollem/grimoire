<template>
  <!--
    One block of a stat block's prose (traits, actions, reactions…), boxed in
    the same panel as `StatBlockPanel` so the numbers and the moves read as one
    stat block rather than a panel followed by loose paragraphs.

    The prose is `text-body`, the theme's reading face, deliberately not the
    panel's `font-stat`: a trait is a paragraph to read, and it sits beside the
    creature's description, which is `text-body` too. Two faces for two kinds of
    prose on one sheet was the bug.
  -->
  <section
    v-if="traits?.length || $slots.default"
    class="trait-list rounded-lg border border-primary/30 bg-card overflow-hidden break-inside-avoid"
  >
    <h3 class="border-b border-primary/20 bg-primary/5 px-4 py-1.5 text-heading-sm text-primary">
      {{ title }}
    </h3>
    <!-- Free text instead of named traits (a spell's description): the same
         titled panel, with the body left to the caller. -->
    <div v-if="$slots.default" class="px-4 py-3 text-body leading-relaxed text-foreground">
      <slot />
    </div>
    <div v-else class="divide-y divide-primary/15">
      <div
        v-for="(trait, i) in traits"
        :key="i"
        class="trait px-4 py-2.5 text-body leading-relaxed text-foreground"
      >
        <span class="font-bold italic">{{ trait.name }}.</span>
        {{ " " }}
        <RichTextViewer v-if="isRichText(trait.description)" :content="trait.description" />
        <!-- Library prose breaks its paragraphs (and its spell lists) with a
             newline: the first runs in after the name, the rest get a gap. -->
        <template v-else>
          <template v-for="(para, p) in paragraphs(trait.description)" :key="p">
            <span v-if="p === 0">{{ para }}</span>
            <p v-else class="mt-1.5">{{ para }}</p>
          </template>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";

defineProps<{
  title: string;
  traits?: Array<{ name: string; description: string }>;
}>();

function paragraphs(value: string): string[] {
  return value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

/** A stored Tiptap document, not merely a string that parses as JSON ("20" does). */
function isRichText(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && (parsed as { type?: unknown }).type === "doc";
  } catch {
    return false;
  }
}
</script>

<style scoped>
/* A rich-text description runs in after the name, as the plain one does,
   instead of dropping its first paragraph onto a line of its own. Later
   paragraphs stay blocks. Generated text wraps its paragraphs in a
   <div data-ai-generated>, so the first one may sit a level down. */
.trait :deep(.rte-content),
.trait :deep(.rte-content > div),
.trait :deep(.ProseMirror),
.trait :deep(.ProseMirror > p:first-child),
.trait :deep(.ProseMirror > div:first-child),
.trait :deep(.ProseMirror > div:first-child > p:first-child) {
  display: inline;
}
</style>
