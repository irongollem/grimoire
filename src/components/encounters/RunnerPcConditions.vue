<template>
  <div class="detail-divider" />
  <p class="detail-section-label">Curses</p>
  <div class="flex flex-wrap gap-1 mb-1">
    <span
      v-for="curse in curses"
      :key="curse"
      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/30 font-cinzel text-2xs text-violet-400 cursor-pointer hover:bg-destructive/20 hover:text-destructive transition-colors"
      title="Click to remove"
      @click="emit('remove-curse', curse)"
    >{{ curse }} ×</span>
    <span v-if="!curses.length" class="text-caption text-muted-foreground italic">None</span>
  </div>
  <div class="flex items-center gap-1">
    <input
      v-model="curseInput"
      placeholder="Add curse…"
      class="flex-1 bg-transparent border-b border-border px-1 py-0.5 text-caption text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
      @keydown.enter.prevent="addCurse"
    />
    <button
      type="button"
      :disabled="!curseInput.trim()"
      class="text-muted-foreground hover:text-violet-400 transition-colors disabled:opacity-40 shrink-0"
      @click="addCurse"
    >+</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  curses: string[];
}>();

const emit = defineEmits<{
  "remove-curse": [curse: string];
  "add-curse": [curse: string];
}>();

const curseInput = ref("");

function addCurse() {
  if (!curseInput.value.trim()) return;
  emit("add-curse", curseInput.value);
  curseInput.value = "";
}
</script>

<style scoped>
@reference "@/assets/main.css";

.detail-divider {
  @apply border-t border-border/60 my-1;
}

.detail-section-label {
  @apply text-eyebrow font-bold text-muted-foreground mt-1;
}
</style>
