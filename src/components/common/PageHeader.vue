<template>
  <div class="mb-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="font-cinzel text-2xl md:text-3xl font-bold text-foreground tracking-wide">
          {{ title }}
        </h1>
        <p v-if="description" class="font-fell text-muted-foreground mt-1 italic">
          {{ description }}
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <slot name="actions" />
        <DiceRoller />
      </div>
    </div>
    <div class="gold-divider mt-4" />
  </div>
</template>

<script setup lang="ts">
import DiceRoller from "@/components/common/DiceRoller.vue";

defineProps<{
  title: string;
  description?: string;
}>();
</script>
