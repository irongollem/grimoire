<template>
  <!-- A sitting that was left is read, not played: the composer's place says so, and the way back is one button. -->
  <div class="flex flex-wrap items-center gap-3 border border-border bg-card px-3 py-2.5" data-testid="solo-left">
    <p class="min-w-0 flex-1 text-body text-foreground">This sitting has ended. You can read the story here; sit down again to play on.</p>
    <AppButton to="/table" variant="outline" size="md" label="Back to the table" />
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
</script>
