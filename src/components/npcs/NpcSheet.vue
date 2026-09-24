<template>
  <!--
    `lg:h-full`, not a viewport calculation. This used to subtract the detail
    page's chrome from `100dvh`, which was a measurement of a host that no longer
    exists: reading an NPC on desktop is a modal over the grid, and the panel is
    the thing with a height. Filling the parent works in either, and stops the
    layout depending on a number nobody would think to update.
  -->
  <div class="flex flex-col gap-6 lg:h-full lg:flex-row lg:gap-6 lg:overflow-hidden">
    <!-- Col 1 / top: portrait + badges, never scrolls on desktop -->
    <div class="flex flex-col gap-3 lg:w-52 lg:shrink-0 lg:pb-6">
      <FocalImage
        :src="displayPortrait"
        :focal-point="displayFocalPoint"
        format="portrait"
        :lightbox="true"
        :placeholder="placeholderUrl('npc')"
        class="w-full rounded-lg overflow-hidden max-h-80 lg:max-h-none lg:flex-1 lg:min-h-0"
      />
      <div class="flex flex-wrap gap-1">
        <span class="text-label bg-muted text-muted-foreground rounded px-2 py-0.5 capitalize">{{ npc.status }}</span>
        <span class="text-label bg-muted text-muted-foreground rounded px-2 py-0.5 capitalize">{{ npc.relationship }}</span>
      </div>
      <div v-if="npc.tags?.length" class="flex flex-wrap gap-1">
        <span v-for="tag in npc.tags" :key="tag" class="text-label bg-muted/60 text-muted-foreground rounded px-2 py-0.5">{{ tag }}</span>
      </div>

      <!--
        ALTER EGO status, at a glance. The toggle itself now lives in the
        reveal control in this modal's header (`NpcDetailModal.vue`), so the
        app has exactly one of it.
      -->
      <div v-if="hasDisguise" class="pt-1 border-t border-border/50">
        <p class="font-cinzel text-2xs tracking-widest text-muted-foreground mb-1.5">ALTER EGO</p>
        <p class="text-caption text-muted-foreground italic">
          {{ npc.is_revealed ? `True form revealed` : `Disguised as ${npc.disguise_name || 'unknown'}` }}
        </p>
      </div>
    </div>

    <!-- Col 2 / below: tabs + content, scrolls on desktop -->
    <div class="flex-1 min-w-0 lg:overflow-y-auto lg:pb-6">
      <NpcTabContent :npc="npc" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import NpcTabContent from "@/components/npcs/NpcTabContent.vue";
import { getNpcDisplayPortrait, getNpcDisplayFocalPoint } from "@/lib/npcDisplay";
import type { Npc } from "@/types/npc.types";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const props = defineProps<{ npc: Npc }>();

const hasDisguise = computed(() =>
  !!(props.npc.disguise_name || props.npc.disguise_portrait_url)
);

const displayPortrait = computed(() => getNpcDisplayPortrait(props.npc));
const displayFocalPoint = computed(() => getNpcDisplayFocalPoint(props.npc));
</script>
