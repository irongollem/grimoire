<template>
  <div
    class="flex items-center gap-2 rounded-md border px-3 py-2"
    :class="variantClasses"
  >
    <span
      v-if="label"
      class="font-cinzel text-xs tracking-wider shrink-0"
      :class="labelClasses"
    >{{ label }}</span>
    <span class="font-fell text-sm text-foreground"><slot /></span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const { variant = "primary", label } = defineProps<{
  variant?: "primary" | "amber" | "destructive" | "muted";
  label?: string;
}>();

const variantClasses = computed(() => {
  switch (variant) {
    case "amber":       return "bg-amber-500/10 border-amber-500/30";
    case "destructive": return "bg-destructive/10 border-destructive/30";
    case "muted":       return "bg-muted/30 border-border";
    case "primary":
    default:            return "bg-primary/10 border-primary/20";
  }
});

const labelClasses = computed(() => {
  switch (variant) {
    case "amber":       return "text-amber-400 uppercase";
    case "destructive": return "text-destructive uppercase";
    case "muted":       return "text-muted-foreground uppercase";
    case "primary":
    default:            return "text-primary uppercase";
  }
});
</script>
