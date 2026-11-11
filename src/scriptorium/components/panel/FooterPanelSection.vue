<template>
  <div data-testid="panel-footer">
    <PanelSection>
      <h2 class="text-eyebrow uppercase text-primary">Footer</h2>
      <p class="text-body text-muted-foreground">Page {{ page }}</p>
    </PanelSection>
  </div>
</template>

<script setup lang="ts">
/** A footer selected on the page (#1176 story 6, frame 10). Story 6 fills this in. */
import PanelSection from "@/scriptorium/components/panel/PanelSection.vue";

defineProps<{ page: number }>();
</script>
