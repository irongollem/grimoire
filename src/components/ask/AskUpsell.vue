<template>
  <div class="flex flex-col gap-2 border border-border bg-card px-3 py-2.5" role="alert" data-testid="ask-upsell">
    <p class="text-body text-foreground">That was today's five free questions.</p>
    <div class="flex flex-wrap gap-2">
      <AppButton variant="primary" size="sm" label="Get credits" @click="emit('credits')" />
      <AppButton variant="outline" size="sm" label="Upgrade to Pro" @click="emit('upgrade')" />
    </div>
    <p class="text-caption text-muted-foreground">The free five come back tomorrow.</p>
  </div>
</template>

<script setup lang="ts">
/** In place of an answer when the day's free questions are spent and there is not a whole credit to spend. */
import AppButton from "@/components/common/controls/AppButton.vue";

const emit = defineEmits<{ credits: []; upgrade: [] }>();
</script>
