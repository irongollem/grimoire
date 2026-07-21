<template>
  <EntityLightbox
    :open="!!companion"
    :portrait-src="companion?.portrait_url ?? null"
    :portrait-alt="companion?.name"
    :focal-point="companion?.portrait_focal_point ?? null"
    @close="$emit('close')"
  >
    <template #portrait-overlay>
      <span
        v-if="companion"
        class="absolute top-2 left-2 text-label md:text-sm px-1.5 py-0.5 rounded text-white"
        :style="{ backgroundColor: COMPANION_TYPE_COLORS[companion.companion_type] + 'CC' }"
      >{{ COMPANION_TYPE_LABELS[companion.companion_type] }}</span>
    </template>

    <div>
      <h2 class="font-cinzel text-lg font-bold text-foreground">{{ companion?.name }}</h2>
      <p v-if="ownerName" class="font-fell text-sm text-muted-foreground italic">
        {{ ownerName }}'s companion
      </p>
    </div>
    <div v-if="companion" class="grid grid-cols-2 gap-3">
      <div class="rounded-md bg-muted p-2.5">
        <div class="flex items-center justify-between mb-1">
          <span class="text-label md:text-sm text-muted-foreground">HP</span>
          <span class="font-cinzel text-sm font-bold" :class="hpColor">
            {{ companion.current_hp }} / {{ companion.max_hp }}
          </span>
        </div>
        <div class="h-1.5 rounded-full bg-background overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            :class="hpBarColor"
            :style="{ width: `${Math.max(0, Math.min(100, (companion.current_hp / companion.max_hp) * 100))}%` }"
          />
        </div>
      </div>
      <div class="rounded-md bg-muted p-2.5 flex items-center gap-2">
        <IconShield class="h-4 w-4 text-muted-foreground shrink-0" />
        <div>
          <p class="text-eyebrow md:text-sm text-muted-foreground">AC</p>
          <p class="font-cinzel text-sm font-bold text-foreground">{{ companion.ac }}</p>
        </div>
      </div>
    </div>
    <div v-if="companion?.conditions?.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="cond in companion.conditions"
        :key="cond"
        class="text-label md:text-sm px-1.5 py-0.5 rounded bg-destructive/10 text-destructive"
      >{{ cond }}</span>
    </div>
    <PlayerNotesWidget v-if="companion" entity-type="companion" :entity-id="companion.id" placeholder="Your thoughts on this companion…" />
  </EntityLightbox>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconShield } from "@/lib/icons";
import EntityLightbox from "@/components/common/EntityLightbox.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import { COMPANION_TYPE_LABELS, COMPANION_TYPE_COLORS } from "@/types/companion.types";
import type { Companion } from "@/types/companion.types";

const { companion, ownerName } = defineProps<{
  companion: Companion | null;
  ownerName: string;
}>();

defineEmits<{ close: [] }>();

const hpPct = computed(() => {
  if (!companion || companion.max_hp === 0) return 0;
  return companion.current_hp / companion.max_hp;
});

const hpColor = computed(() => {
  const p = hpPct.value;
  return p < 0.33 ? "text-destructive" : p < 0.66 ? "text-amber-400" : "text-elven-green";
});

const hpBarColor = computed(() => {
  const p = hpPct.value;
  return p < 0.33 ? "bg-destructive" : p < 0.66 ? "bg-amber-400" : "bg-elven-green";
});
</script>
