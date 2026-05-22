<template>
  <div class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 border border-border/50 group/row">
    <!-- Drag handle -->
    <span
      class="drag-handle shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
      title="Drag to reorder"
    >
      <IconDrag class="h-3.5 w-3.5" />
    </span>

    <!-- Track name -->
    <span class="flex-1 min-w-0 font-cinzel text-xs text-foreground truncate">{{ sound.name }}</span>

    <!-- Category chip -->
    <span
      class="shrink-0 font-fell text-[10px] px-1.5 py-0.5 rounded border"
      :class="categoryChipClass"
    >
      {{ sound.category }}
    </span>

    <!-- Remove button -->
    <button
      type="button"
      class="shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover/row:opacity-100"
      title="Remove from playlist"
      @click="$emit('remove')"
    >
      <IconClose class="h-3.5 w-3.5" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconDrag, IconClose } from "@/lib/icons";
import type { Sound } from "@/types/sound.types";

const { sound } = defineProps<{ sound: Sound }>();
defineEmits<{ remove: [] }>();

const categoryChipClass = computed(() => {
  switch (sound.category) {
    case "music":   return "border-gold-500/30 text-gold-400";
    case "ambient": return "border-green-500/30 text-green-400";
    case "effects": return "border-blue-500/30 text-blue-400";
    default:        return "border-border text-muted-foreground";
  }
});
</script>
