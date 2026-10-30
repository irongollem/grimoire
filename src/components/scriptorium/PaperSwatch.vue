<template>
  <!-- A small real sample of the paper: the same theme class and surface the
       document will have, so the picker shows the true texture and face. -->
  <div
    class="sc-theme sc-paper-surface paper-swatch"
    :class="[themeClass, { 'paper-swatch--selected': selected }]"
    aria-hidden="true"
  >
    <p class="paper-swatch__title">{{ look.label }}</p>
    <p class="paper-swatch__line">{{ sample }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ScriptoriumPaper } from "@/types/scriptorium.types";
import { scriptoriumLook } from "@/lib/scriptorium/looks";

/**
 * One paper of the "What is it written on?" picker (#1115). Presentational:
 * the parent wraps it in a button and owns the click.
 */
const { paper, selected = false } = defineProps<{
  paper: ScriptoriumPaper;
  selected?: boolean;
}>();

const SAMPLES: Record<ScriptoriumPaper, string> = {
  letter: "Dear friend, come at dusk.",
  notice: "By order of the Watch",
  journal: "Day nine. The bridge is out.",
  plain: "A page torn from the book.",
};

const look = computed(() => scriptoriumLook(paper));
const themeClass = computed(() => look.value.className);
const sample = computed(() => SAMPLES[paper]);
</script>

<style scoped>
.paper-swatch.sc-paper-surface {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 6rem;
  padding: 0.75rem 1rem;
  border-radius: 0.25rem;
  overflow: hidden;
  text-align: left;
  line-height: 1.4;
  box-shadow: 0 0 0 1px var(--sc-col-rule);
}
.paper-swatch--selected {
  box-shadow: 0 0 0 2px var(--sc-accent);
}
.paper-swatch p {
  margin: 0;
  text-indent: 0;
}
.paper-swatch__title {
  font-family: var(--sc-heading-font);
  font-size: 0.8125rem;
  letter-spacing: 0.04em;
  color: var(--sc-ink);
}
.paper-swatch__line {
  font-size: 0.9375rem;
  color: var(--sc-ink);
}
.paper-swatch.theme-notice {
  text-align: center;
  outline-offset: -0.375rem;
}
.paper-swatch.theme-notice .paper-swatch__title {
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-weight: 900;
}
</style>
