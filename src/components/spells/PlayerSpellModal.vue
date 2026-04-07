<template>
  <Teleport to="body">
    <Transition name="spell-modal">
      <div
        v-if="spell"
        class="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4"
        role="dialog"
        aria-modal="true"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$emit('close')" />

        <!-- Panel -->
        <div class="relative w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl border border-border bg-background shadow-2xl flex flex-col max-h-[90dvh]">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
            <div class="min-w-0">
              <h2 class="font-cinzel text-base font-bold text-foreground truncate">{{ spell.name }}</h2>
              <p class="font-fell text-xs text-muted-foreground italic capitalize">
                {{ spellSubtitle }}
              </p>
            </div>
            <button
              class="shrink-0 ml-3 text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
              @click="$emit('close')"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <!-- Body (scrollable) -->
          <div class="flex-1 overflow-y-auto p-5">
            <SpellSheet :spell="spell" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { X } from "lucide-vue-next";
import { spellLevelLabel } from "@/types/spell.types";
import type { Spell } from "@/types/spell.types";
import SpellSheet from "@/components/spells/SpellSheet.vue";

const props = defineProps<{ spell: Spell | null }>();
defineEmits<{ close: [] }>();

const spellSubtitle = computed(() => {
  const s = props.spell;
  if (!s) return "";
  return [spellLevelLabel(s.level), s.school, s.ritual ? "Ritual" : null, s.concentration ? "Concentration" : null]
    .filter(Boolean)
    .join(" · ");
});
</script>

<style scoped>
.spell-modal-enter-active,
.spell-modal-leave-active {
  transition: opacity 0.2s ease;
}
.spell-modal-enter-active .relative,
.spell-modal-leave-active .relative {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.spell-modal-enter-from,
.spell-modal-leave-to {
  opacity: 0;
}
.spell-modal-enter-from .relative,
.spell-modal-leave-to .relative {
  transform: translateY(12px);
  opacity: 0;
}
</style>
