<template>
  <span class="ask-hand"><slot /></span>
</template>

<script setup lang="ts">
/**
 * The DM's own words in Ask Grimoire (a message they sent, the question under the search row), set in the hand.
 * Print is the book's voice and hand is the DM's (#1031); the Vellum rule for an `AppInput` lives in vellum.css
 * against `[data-field]`, and this is the same face and ink for text that is not a field.
 */
</script>

<style scoped>
:root[data-theme^="vellum"] .ask-hand {
  font-family: "Fondamento", var(--vl-serif);
  color: var(--vl-hand-ink);
}
</style>
