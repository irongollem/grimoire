<template>
  <section class="flex flex-col gap-2.5" :aria-labelledby="headingId">
    <header class="flex items-center gap-2.5 px-1">
      <h2 :id="headingId" class="hearth-rubric whitespace-nowrap">{{ title }}</h2>
      <span class="hearth-rule flex-1" aria-hidden="true" />
      <slot name="end" />
    </header>
    <slot />
  </section>
</template>

<script setup lang="ts">
import { useId } from "vue";

/**
 * A Hearth section: an oxblood small-capital title trailing a fading rule, the
 * same rubric the DM screen's reference panels carry (`.screen-table` in
 * vellum.css), with the section's card(s) below. `#end` holds a count or a link.
 */
const { title } = defineProps<{ title: string }>();
const headingId = useId();
</script>

<style scoped>
/* Cinzel by name, as the DM screen's rubric does: Vellum repaints the
   font-cinzel utility as Alegreya, and a rubric is display type. `--live-ink`
   is Vellum's text-safe oxblood; the classic themes have none, so gilt. */
.hearth-rubric {
  margin: 0;
  font-family: "Cinzel", Georgia, serif;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--live-ink, var(--primary));
}

.hearth-rule {
  height: 1px;
  background: linear-gradient(90deg, color-mix(in oklab, var(--live-ink, var(--primary)) 40%, transparent), transparent);
}
</style>
