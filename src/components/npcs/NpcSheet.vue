<template>
  <div class="flex flex-col gap-6 lg:flex-row lg:gap-6 lg:h-[calc(100dvh-7.5rem)] lg:overflow-hidden">
    <!-- Col 1 / top: portrait + badges, never scrolls on desktop -->
    <div class="flex flex-col gap-3 lg:w-52 lg:shrink-0 lg:pb-6">
      <FocalImage
        v-if="npc.portrait_url"
        :src="npc.portrait_url"
        :focal-point="npc.portrait_focal_point"
        format="portrait"
        class="w-full rounded-lg overflow-hidden max-h-80 lg:max-h-none lg:flex-1 lg:min-h-0"
      />
      <div class="flex flex-wrap gap-1">
        <span class="font-cinzel text-[10px] tracking-wider bg-muted text-muted-foreground rounded px-2 py-0.5 capitalize">{{ npc.status }}</span>
        <span class="font-cinzel text-[10px] tracking-wider bg-muted text-muted-foreground rounded px-2 py-0.5 capitalize">{{ npc.relationship }}</span>
      </div>
      <div v-if="npc.tags?.length" class="flex flex-wrap gap-1">
        <span v-for="tag in npc.tags" :key="tag" class="font-cinzel text-[10px] tracking-wider bg-muted/60 text-muted-foreground rounded px-2 py-0.5">{{ tag }}</span>
      </div>
    </div>

    <!-- Col 2 / below: tabs + content, scrolls on desktop -->
    <div class="flex-1 min-w-0 lg:overflow-y-auto lg:pb-6">
      <NpcTabContent :npc="npc" />
    </div>
  </div>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/FocalImage.vue";
import NpcTabContent from "@/components/npcs/NpcTabContent.vue";
import type { Npc } from "@/types/npc.types";

defineProps<{ npc: Npc }>();
</script>
