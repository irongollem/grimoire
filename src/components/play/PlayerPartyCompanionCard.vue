<template>
  <div
    class="flex flex-col rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
    @click="$emit('click')"
  >
    <div class="relative aspect-3/4 bg-muted overflow-hidden shrink-0 group">
      <FocalImage
        :src="companion.portrait_url"
        :alt="companion.name"
        format="portrait"
        :focal-point="companion.portrait_focal_point ?? null"
        placeholder="/assets/placeholders/companion.webp"
        class="group-hover:scale-105 transition-transform duration-300"
      />
      <span
        class="absolute top-2 right-2 text-label md:text-sm px-1.5 py-0.5 rounded text-white"
        :style="{ backgroundColor: COMPANION_TYPE_COLORS[companion.companion_type] + 'CC' }"
      >{{ COMPANION_TYPE_LABELS[companion.companion_type] }}</span>
      <span
        v-if="!companion.combat_ready"
        class="absolute top-2 left-2 text-label md:text-sm px-1.5 py-0.5 rounded bg-black/60 text-white italic"
        title="Not with the party right now"
      >Elsewhere</span>
    </div>
    <div class="p-2.5 flex flex-col gap-1.5">
      <div>
        <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ companion.name }}</h3>
        <p class="text-caption text-muted-foreground italic truncate">{{ ownerName || "Party companion" }}</p>
      </div>
      <div>
        <template v-if="showNumericHp">
          <div class="flex items-center justify-between mb-0.5">
            <span class="text-label md:text-sm text-muted-foreground">HP</span>
            <span class="font-cinzel text-2xs md:text-sm" :class="hpColor">{{ companion.current_hp }} / {{ companion.max_hp }}</span>
          </div>
          <div class="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="hpBarColor"
              :style="{ width: `${companion.max_hp > 0 ? Math.max(0, Math.min(100, (companion.current_hp / companion.max_hp) * 100)) : 0}%` }"
            />
          </div>
        </template>
        <template v-else>
          <span class="text-eyebrow md:text-sm text-muted-foreground">HP</span>
          <p class="text-caption italic" :class="hpColor">{{ immersiveHpLabel }}</p>
        </template>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <span class="flex items-center gap-1">
          <IconShield class="h-3 w-3 text-muted-foreground shrink-0" />
          <span class="font-cinzel text-xs font-bold text-foreground">{{ companion.ac }}</span>
        </span>
        <span
          v-for="cond in (companion.conditions ?? []).slice(0, 2)"
          :key="cond"
          class="text-label md:text-sm px-1 py-0.5 rounded bg-destructive/10 text-destructive"
        >{{ cond }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconShield } from "@/lib/icons";
import FocalImage from "@/components/common/FocalImage.vue";
import { useHpDisplay } from "@/composables/useHpDisplay";
import { COMPANION_TYPE_LABELS, COMPANION_TYPE_COLORS } from "@/types/companion.types";
import type { Companion } from "@/types/companion.types";

const { companion, ownerName, showNumericHp } = defineProps<{
  companion: Companion;
  ownerName: string;
  showNumericHp: boolean;
}>();

defineEmits<{ click: [] }>();

const { hpColor, hpBarColor, immersiveHpLabel } = useHpDisplay(
  () => companion.current_hp,
  () => companion.max_hp
);
</script>
