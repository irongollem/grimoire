<template>
  <Transition name="fade">
    <div
      v-if="combatant"
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      @click.self="$emit('close')"
    >
      <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div class="relative shrink-0">
          <div v-if="combatant.portrait_url" class="w-full h-72 overflow-hidden">
            <FocalImage
              :src="combatant.portrait_url"
              :alt="combatant.name"
              :focal-point="combatant.portrait_focal_point ?? null"
              format="portrait"
            />
          </div>
          <button
            class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors"
            @click="$emit('close')"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>
        <div class="p-4 overflow-y-auto space-y-4">
          <h2 class="font-cinzel text-lg font-bold text-foreground">{{ combatant.name }}</h2>
          <PlayerNotesWidget
            v-if="combatant.monster_id"
            entity-type="monster"
            :entity-id="combatant.monster_id"
            placeholder="Your observations about this creature…"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { IconClose } from "@/lib/icons";
import FocalImage from "@/components/common/FocalImage.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import type { RunCombatant } from "@/types/encounter.types";

defineProps<{ combatant: RunCombatant | null }>();
defineEmits<{ close: [] }>();
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to    { opacity: 0; }
</style>
