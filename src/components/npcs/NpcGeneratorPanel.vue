<template>
  <!-- Slide-over panel -->
  <Transition name="fade">
    <div
      v-if="ui.npcGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="ui.npcGeneratorOpen = false"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.npcGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <div class="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 class="font-cinzel text-base font-semibold text-foreground">
          NPC Generator
        </h2>
        <button
          class="text-muted-foreground hover:text-foreground"
          @click="ui.npcGeneratorOpen = false"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-5">
        <p class="font-fell text-muted-foreground italic text-sm">
          AI-powered NPC generator — coming soon. Will connect to Claude Haiku or GPT-4o mini.
        </p>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to   { opacity: 0; }

.slide-right-enter-active,
.slide-right-leave-active { transition: transform 0.25s ease; }
.slide-right-enter-from,
.slide-right-leave-to   { transform: translateX(100%); }
</style>
