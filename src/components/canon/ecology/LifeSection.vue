<template>
  <section id="canon-life" class="flex scroll-mt-4 flex-col gap-4" aria-labelledby="canon-life-heading">
    <CanonRubric id="canon-life-heading" numeral="VI" title="Who and what lives here" />
    <p class="text-caption text-muted-foreground">
      Who and what lives in the world: its peoples, and the creatures of each kind of country. Grimoire rolls from these when it invents a person or an encounter, and every generator is told what is common here.
    </p>
    <div class="flex flex-col gap-1">
      <h3 class="m-0 text-eyebrow text-muted-foreground">Peoples</h3>
      <WorldPeoples />
    </div>
    <div class="flex flex-col gap-1">
      <h3 class="m-0 text-eyebrow text-muted-foreground">Habitats</h3>
      <HabitatsPanel />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Part VI (#1255 item 31): both halves of "who and what lives here" read together. The peoples moved here from How the
 * world works, unchanged; the habitats are new. None of it is a canon entry, so the part has no count.
 */
import CanonRubric from "../CanonRubric.vue";
import WorldPeoples from "../WorldPeoples.vue";
import HabitatsPanel from "./HabitatsPanel.vue";
</script>
