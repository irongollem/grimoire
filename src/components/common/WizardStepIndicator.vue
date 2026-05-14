<template>
  <div class="flex items-center justify-center gap-1 flex-wrap">
    <template v-for="(step, idx) in steps" :key="step.id">
      <span
        class="font-cinzel text-[10px] px-1.5 py-0.5 rounded transition-colors"
        :class="idx === currentIndex
          ? 'bg-primary text-primary-foreground'
          : idx < currentIndex
            ? 'bg-primary/30 text-foreground'
            : 'bg-muted text-muted-foreground'"
      >{{ step.label }}</span>
      <span v-if="idx < steps.length - 1" class="text-muted-foreground/40 text-xs">→</span>
    </template>
    <span v-if="caption" class="font-cinzel text-[10px] text-muted-foreground ml-1">{{ caption }}</span>
  </div>
</template>

<script setup lang="ts">
export interface WizardStep {
  id: string;
  label: string;
}

defineProps<{
  steps: ReadonlyArray<WizardStep>;
  currentIndex: number;
  caption?: string;
}>();
</script>
