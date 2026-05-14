<template>
  <Transition name="fade">
    <div
      v-if="companion"
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      @click.self="$emit('close')"
    >
      <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div class="relative shrink-0">
          <div v-if="companion.portrait_url" class="w-full h-72 overflow-hidden">
            <FocalImage
              :src="companion.portrait_url"
              :alt="companion.name"
              format="portrait"
              :focal-point="companion.portrait_focal_point ?? null"
              :lightbox="true"
            />
          </div>
          <button
            class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors"
            @click="$emit('close')"
          >
            <IconClose class="h-4 w-4" />
          </button>
          <span
            class="absolute top-2 left-2 font-cinzel text-2xs md:text-sm px-1.5 py-0.5 rounded tracking-wider text-white"
            :style="{ backgroundColor: COMPANION_TYPE_COLORS[companion.companion_type] + 'CC' }"
          >{{ COMPANION_TYPE_LABELS[companion.companion_type] }}</span>
        </div>
        <div class="p-4 overflow-y-auto space-y-4">
          <div>
            <h2 class="font-cinzel text-lg font-bold text-foreground">{{ companion.name }}</h2>
            <p v-if="ownerName" class="font-fell text-sm text-muted-foreground italic">
              {{ ownerName }}'s companion
            </p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-md bg-muted p-2.5">
              <div class="flex items-center justify-between mb-1">
                <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider">HP</span>
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
                <p class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider">AC</p>
                <p class="font-cinzel text-sm font-bold text-foreground">{{ companion.ac }}</p>
              </div>
            </div>
          </div>
          <div v-if="companion.conditions?.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="cond in companion.conditions"
              :key="cond"
              class="font-cinzel text-2xs md:text-sm px-1.5 py-0.5 rounded bg-destructive/10 text-destructive tracking-wider"
            >{{ cond }}</span>
          </div>
          <PlayerNotesWidget entity-type="companion" :entity-id="companion.id" placeholder="Your thoughts on this companion…" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconClose, IconShield } from "@/lib/icons";
import FocalImage from "@/components/common/FocalImage.vue";
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

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
