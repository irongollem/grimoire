<template>
  <div class="flex flex-col h-full">
    <div class="h-1 w-full shrink-0" :class="crBg(monster?.stat_block?.challenge_rating)" />
    <div class="flex flex-1">
      <div class="shrink-0 w-20 h-24 bg-muted overflow-hidden">
        <FocalImage
          v-if="imageUrl"
          :src="imageUrl"
          :alt="name"
          format="portrait"
          :focal-point="monster?.portrait_focal_point"
          class="group-hover:scale-105 transition-transform duration-300"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center text-title font-bold"
          :class="crTextColor(monster?.stat_block?.challenge_rating)"
        >{{ name?.charAt(0) }}</div>
      </div>
      <div class="flex flex-col justify-between min-w-0 p-3 flex-1">
        <div>
          <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ name }}</h3>
          <p v-if="monster" class="text-caption text-muted-foreground italic capitalize">{{ monster.size }} {{ monster.monster_type }}</p>
        </div>
        <div v-if="monster" class="flex gap-3 font-cinzel text-xs text-muted-foreground">
          <template v-if="revealStats">
            <span><span class="text-foreground font-bold">AC</span> {{ monster.stat_block.armor_class }}</span>
            <span><span class="text-foreground font-bold">HP</span> {{ formatHitPoints(monster.stat_block.hit_points) }}</span>
          </template>
          <span
            class="ml-auto px-1.5 py-0.5 rounded font-bold text-white text-2xs"
            :class="crBg(monster.stat_block.challenge_rating)"
          >CR {{ crText(monster.stat_block.challenge_rating) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/FocalImage.vue";
import type { Monster } from "@/types/monster.types";
import { formatHitPoints } from "@/lib/utils";
import { crBg, crText, crTextColor } from "@/lib/monsterDisplay";

defineProps<{
  monster: Monster | null;
  name: string;
  imageUrl: string | null;
  revealStats?: boolean;
}>();
</script>
