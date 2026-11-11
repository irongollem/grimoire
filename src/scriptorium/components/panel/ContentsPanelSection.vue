<template>
  <div data-testid="panel-contents">
    <PanelSection>
      <h2 class="text-eyebrow uppercase text-primary">Contents</h2>
      <p class="text-body text-muted-foreground">
        Made from your headings. It updates as you write; to change an entry, change its heading.
      </p>
    </PanelSection>
  </div>
</template>

<script setup lang="ts">
/** The contents page selected (#1176 frame 06): it has nothing to set, so the panel says where it comes from. */
import PanelSection from "@/scriptorium/components/panel/PanelSection.vue";
</script>
