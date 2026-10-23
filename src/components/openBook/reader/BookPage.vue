<script setup lang="ts">
/** One leaf face of the book: paper, running head, folio, and the gutter shadow. What it holds is the slot. */
const { side, runLeft = null, runRight = null, folio = null, label } = defineProps<{
  side: "verso" | "recto";
  runLeft?: string | null;
  runRight?: string | null;
  folio?: string | null;
  /** Names the page for assistive technology, e.g. "Page 31". */
  label: string;
}>();
</script>

<template>
  <section class="ob-page ob-paper" :data-side="side" :aria-label="label">
    <div v-if="runLeft || runRight" class="ob-runhead" aria-hidden="true">
      <span>{{ runLeft }}</span>
      <span>{{ runRight }}</span>
    </div>
    <div class="ob-page-body">
      <slot />
    </div>
    <div class="ob-folio" aria-hidden="true">{{ folio }}</div>
  </section>
</template>
