<template>
  <div
    v-if="quests.length"
    class="rounded-lg border border-border bg-card overflow-hidden"
  >
    <div class="px-3 py-2 border-b border-border bg-muted/20">
      <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
        Part of Quest
        <span class="font-fell font-normal">({{ quests.length }})</span>
      </span>
    </div>
    <div class="p-2 flex flex-col gap-1">
      <RouterLink
        v-for="q in quests"
        :key="q.id"
        :to="`/quests/${q.id}`"
        class="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40 transition-colors group"
      >
        <IconScrollText class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span class="font-fell text-sm text-foreground flex-1 truncate group-hover:text-primary transition-colors">
          {{ q.title || "Untitled Quest" }}
        </span>
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconScrollText } from "@/lib/icons";

const { quests } = defineProps<{
  quests: { id: string; title: string | null }[];
}>();
</script>
