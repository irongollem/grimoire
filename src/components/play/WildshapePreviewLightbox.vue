<template>
  <Transition name="fade">
    <div
      v-if="beast"
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      @click.self="emit('close')"
    >
      <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

        <!-- Portrait (if any) -->
        <div class="relative shrink-0">
          <div v-if="beast.image_url" class="w-full h-48 overflow-hidden">
            <FocalImage
              :src="beast.image_url"
              :alt="beast.name"
              :focal-point="beast.portrait_focal_point ?? null"
              format="portrait"
              :lightbox="true"
            />
          </div>
          <button
            class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors"
            @click="emit('close')"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>

        <!-- Body: name + stat block -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <h2 class="font-cinzel text-lg font-bold text-foreground">{{ beast.name }}</h2>
            <p class="font-fell text-xs text-muted-foreground italic">
              {{ beast.size }} {{ beast.monster_type }}
              · CR {{ beast.stat_block?.challenge_rating }}
            </p>
          </div>
          <StatBlockPanel v-if="beast.stat_block" :sb="beast.stat_block" />

          <!-- Special abilities -->
          <div v-if="beast.stat_block?.special_abilities?.length" class="space-y-2">
            <p class="font-cinzel text-2xs md:text-sm font-semibold tracking-wider text-primary/70 uppercase border-b border-primary/20 pb-1">Special Abilities</p>
            <div
              v-for="trait in beast.stat_block.special_abilities"
              :key="trait.name"
              class="font-fell text-sm leading-snug"
            >
              <span class="font-semibold not-italic">{{ trait.name }}.</span>
              {{ trait.description }}
            </div>
          </div>

          <!-- Actions -->
          <div v-if="beast.stat_block?.actions?.length" class="space-y-2">
            <p class="font-cinzel text-2xs md:text-sm font-semibold tracking-wider text-primary/70 uppercase border-b border-primary/20 pb-1">Actions</p>
            <div
              v-for="action in beast.stat_block.actions"
              :key="action.name"
              class="font-fell text-sm leading-snug"
            >
              <span class="font-semibold not-italic">{{ action.name }}.</span>
              {{ action.description }}
            </div>
          </div>

          <!-- Bonus Actions -->
          <div v-if="beast.stat_block?.bonus_actions?.length" class="space-y-2">
            <p class="font-cinzel text-2xs md:text-sm font-semibold tracking-wider text-primary/70 uppercase border-b border-primary/20 pb-1">Bonus Actions</p>
            <div
              v-for="action in beast.stat_block.bonus_actions"
              :key="action.name"
              class="font-fell text-sm leading-snug"
            >
              <span class="font-semibold not-italic">{{ action.name }}.</span>
              {{ action.description }}
            </div>
          </div>

          <!-- Reactions -->
          <div v-if="beast.stat_block?.reactions?.length" class="space-y-2">
            <p class="font-cinzel text-2xs md:text-sm font-semibold tracking-wider text-primary/70 uppercase border-b border-primary/20 pb-1">Reactions</p>
            <div
              v-for="action in beast.stat_block.reactions"
              :key="action.name"
              class="font-fell text-sm leading-snug"
            >
              <span class="font-semibold not-italic">{{ action.name }}.</span>
              {{ action.description }}
            </div>
          </div>
        </div>

        <!-- Footer: cancel + confirm -->
        <div class="shrink-0 border-t border-border px-4 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            class="font-cinzel text-xs px-3 py-1.5 rounded border border-border hover:bg-muted/50 transition-colors"
            @click="emit('close')"
          >Cancel</button>
          <button
            type="button"
            :disabled="!canWildshape && !activeWildshape"
            class="font-cinzel text-xs px-3 py-1.5 rounded border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            @click="emit('confirm')"
          >🐺 Wild Shape</button>
        </div>

      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { IconClose } from '@/lib/icons';
import FocalImage from "@/components/common/FocalImage.vue";
import StatBlockPanel from "@/components/common/StatBlockPanel.vue";
import type { Monster } from "@/types/monster.types";

const { beast, canWildshape, activeWildshape } = defineProps<{
  beast: Monster | null;
  canWildshape: boolean;
  activeWildshape: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to    { opacity: 0; }
</style>
