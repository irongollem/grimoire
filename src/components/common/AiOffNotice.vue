<template>
  <p class="text-caption text-muted-foreground text-center">
    AI is off for this campaign.
    <AppButton
      to="/campaign/settings?tab=ai"
      variant="link"
      size="inline-caption"
      label="Turn it on"
    />
  </p>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";

/**
 * Stands in for a Generate button while the campaign's AI Assistant toggle is
 * off. The toggle is opt-in (an AI Act consent sits behind it), so a DM who has
 * never switched it on would otherwise never learn the generator exists: a
 * hidden button explains nothing, and an upgrade prompt names the wrong
 * blocker now that every plan may generate with credits.
 */
</script>
