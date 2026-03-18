<template>
  <div class="flex items-center gap-3">
    <span class="font-cinzel text-[10px] font-bold tracking-wider w-5 shrink-0" :class="color">{{ symbol }}</span>
    <span class="font-fell text-xs text-muted-foreground flex-1">{{ label }}</span>
    <div class="flex items-center gap-1.5">
      <button
        class="h-5 w-5 rounded flex items-center justify-center bg-muted/50 hover:bg-muted border border-border transition-colors"
        @click="$emit('adjust', -1)"
      ><Minus class="h-2.5 w-2.5" /></button>
      <span class="font-cinzel text-sm font-bold text-foreground min-w-8 text-center">{{ value }}</span>
      <button
        class="h-5 w-5 rounded flex items-center justify-center bg-muted/50 hover:bg-muted border border-border transition-colors"
        @click="$emit('adjust', 1)"
      ><Plus class="h-2.5 w-2.5" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus, Minus } from "lucide-vue-next";
defineProps<{ label: string; symbol: string; color: string; value: number }>();
defineEmits<{ adjust: [delta: number] }>();
</script>
