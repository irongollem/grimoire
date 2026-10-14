<template>
  <div class="mx-auto max-w-md space-y-4 py-16 text-center" role="status">
    <p class="text-heading-sm font-semibold text-foreground">{{ name }} isn't yours to change</p>
    <p class="text-body text-muted-foreground italic">
      You're looking after {{ name }} for {{ ownerName ?? "their player" }}. You can play them, but only {{ ownerName ?? "their player" }} can level them up or edit them.
    </p>
    <AppButton :to="{ name: 'play-character' }" variant="subtle" size="md" :label="`Back to ${name}`" />
  </div>
</template>

<script setup lang="ts">
/** Stands in for the level-up and edit screens while the character is only being looked after (#1059); the server refuses anyway. */
import AppButton from "@/components/common/controls/AppButton.vue";

defineProps<{ name: string; ownerName: string | null }>();
</script>
