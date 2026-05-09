<template>
  <div class="forge-root">
    <div class="screen-panel">
      <CardForgeTopBar />
      <div class="forge-body">
        <CardForgeSourcePanel />
        <CardForgePreviewGrid />
      </div>
    </div>

    <CardForgeSaveCollectionModal />
    <CardForgeLoadCollectionModal />

    <CardForgePrintSheet />
  </div>
</template>

<script setup lang="ts">
import CardForgeTopBar from "@/components/cardforge/CardForgeTopBar.vue";
import CardForgeSourcePanel from "@/components/cardforge/CardForgeSourcePanel.vue";
import CardForgePreviewGrid from "@/components/cardforge/CardForgePreviewGrid.vue";
import CardForgePrintSheet from "@/components/cardforge/CardForgePrintSheet.vue";
import CardForgeSaveCollectionModal from "@/components/cardforge/CardForgeSaveCollectionModal.vue";
import CardForgeLoadCollectionModal from "@/components/cardforge/CardForgeLoadCollectionModal.vue";
</script>

<style scoped>
@reference "@/assets/main.css";

.forge-root {
  @apply min-h-screen;
}
.screen-panel {
  @apply flex flex-col gap-4 p-4 h-screen;
}
.forge-body {
  @apply flex gap-4 flex-1 min-h-0;
}

@media print {
  .forge-root {
    min-height: 0 !important;
    height: auto !important;
  }
  .screen-panel {
    display: none !important;
  }
}
</style>
