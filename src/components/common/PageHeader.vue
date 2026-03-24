<template>
  <div>
    <!-- Sticky section: title + actions + optional extra content -->
    <div class="sticky top-0 z-10 bg-background px-4 pt-4 md:px-6 md:pt-6">
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
      <div v-if="$slots['sticky']" class="py-3">
        <slot name="sticky" />
      </div>
      <div v-else class="pb-4" />
    </div>

    <!-- Page body -->
    <div class="px-4 pb-4 md:px-6 md:pb-6">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import DiceRoller from "@/components/common/DiceRoller.vue";

defineProps<{
  title: string;
  description?: string;
}>();
</script>
