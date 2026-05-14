<template>
  <div class="relative bg-card border-t border-border rounded-t-2xl px-5 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-xl">
    <div class="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-5" />

    <div class="grid grid-cols-4 sm:grid-cols-7 gap-1">
      <RouterLink
        v-for="item in sortedNav"
        :key="item.to"
        :to="item.to"
        class="flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 transition-colors"
        :class="isActive(item.to)
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'"
        @click="emit('close')"
      >
        <component :is="item.icon" class="h-5 w-5 shrink-0" />
        <span class="font-cinzel text-2xs md:text-xs tracking-wider text-center leading-tight">{{ item.label }}</span>
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { usePlayerNavPrefs } from "@/composables/usePlayerNavPrefs";

defineEmits<{
  close: [];
}>();

const route = useRoute();
const { sortedNav } = usePlayerNavPrefs();

function isActive(to: string): boolean {
  return to === "/play" ? route.path === "/play" : route.path.startsWith(to);
}
</script>
