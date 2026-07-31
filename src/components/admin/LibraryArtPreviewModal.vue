<script setup lang="ts">
import { IconClose } from "@/lib/icons";
import MonsterSheet from "@/components/monsters/MonsterSheet.vue";
import SpellSheet from "@/components/spells/SpellSheet.vue";
import type { Monster } from "@/types/monster.types";
import type { Spell } from "@/types/spell.types";

const { monster = null, spell = null } = defineProps<{
  monster?: Monster | null;
  spell?: Spell | null;
}>();

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <Transition name="library-preview">
      <div
        class="fixed inset-0 z-200 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        @keydown.esc="emit('close')"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')" />
        <div class="relative w-full max-w-2xl rounded-xl border border-border bg-background shadow-2xl flex flex-col max-h-[90dvh]">
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
            <h2 class="text-heading-sm font-bold text-foreground truncate">
              {{ (monster ?? spell)?.name ?? "Loading…" }}
            </h2>
            <button
              type="button"
              class="shrink-0 ml-3 text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
              @click="emit('close')"
            >
              <IconClose class="h-4 w-4" />
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-5">
            <MonsterSheet v-if="monster" :monster="monster" />
            <SpellSheet v-else-if="spell" :spell="spell" />
            <p v-else class="text-caption text-muted-foreground italic">Loading…</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.srd-preview-enter-active,
.srd-preview-leave-active {
  transition: opacity 0.2s ease;
}
.srd-preview-enter-active .relative,
.srd-preview-leave-active .relative {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.srd-preview-enter-from,
.srd-preview-leave-to {
  opacity: 0;
}
.srd-preview-enter-from .relative,
.srd-preview-leave-to .relative {
  transform: translateY(0.75rem);
  opacity: 0;
}
</style>
