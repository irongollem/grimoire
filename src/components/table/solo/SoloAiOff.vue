<template>
  <!-- "The table is not open": AI is off for this campaign (Wrong, 08). -->
  <div class="mx-auto flex max-w-lg flex-col gap-2 border border-border bg-card px-4 py-3.5" data-testid="solo-ai-off">
    <span class="text-label-lg font-semibold text-foreground">AI is off for this campaign</span>
    <p class="text-caption text-muted-foreground">The solo table needs it. Turn it on in the campaign's settings.</p>
    <AppButton to="/campaign/settings?tab=ai" variant="outline" size="md" label="Open settings" class="self-start" />
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
</script>
