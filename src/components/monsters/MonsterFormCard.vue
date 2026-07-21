<template>
  <div class="flex flex-col h-full">
    <div class="h-1 w-full shrink-0" :style="{ backgroundColor: crColor(monster?.stat_block?.challenge_rating ?? '0') }" />
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
          class="w-full h-full flex items-center justify-center font-cinzel text-2xl font-bold"
          :style="{ color: crColor(monster?.stat_block?.challenge_rating ?? '0') }"
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
            :style="{ backgroundColor: crColor(monster.stat_block.challenge_rating) }"
          >CR {{ monster.stat_block.challenge_rating }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/FocalImage.vue";
import type { Monster } from "@/types/monster.types";
import { formatHitPoints } from "@/lib/utils";

defineProps<{
  monster: Monster | null;
  name: string;
  imageUrl: string | null;
  revealStats?: boolean;
}>();

function parseFraction(s: string) {
  const [a, b] = s.split("/");
  return parseFloat(a) / parseFloat(b);
}

function crColor(cr: string): string {
  const n = cr === "0" ? 0 : cr.includes("/") ? parseFraction(cr) : parseFloat(cr);
  if (n <= 0.5) return "#22c55e";
  if (n <= 4)   return "#eab308";
  if (n <= 9)   return "#f97316";
  if (n <= 15)  return "#dc2626";
  return "#7c3aed";
}
</script>
