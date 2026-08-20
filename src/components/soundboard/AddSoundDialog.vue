<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="$emit('close')"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <div
          class="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-sound-title"
        >
          <!-- Header -->
          <div class="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border">
            <div class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-gold-500/15 text-gold-400">
              <IconMusic class="h-4.5 w-4.5" />
            </div>
            <h2 id="add-sound-title" class="font-cinzel text-sm font-bold text-foreground tracking-wide">
              Add Sound
            </h2>
            <AppButton
              variant="ghost"
              size="icon-xs"
              icon-size="md"
              class="ml-auto"
              :icon="IconClose"
              aria-label="Close"
              @click="$emit('close')"
            />
          </div>

          <!-- Body -->
          <div class="px-5 py-4">
            <SoundForm
              :page-id="pageId"
              :gemini-api-key="geminiApiKey"
              :campaign-id="campaignId"
              @saved="$emit('close')"
              @cancel="$emit('close')"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { IconClose, IconMusic } from '@/lib/icons';
import SoundForm from "./SoundForm.vue";
import { useHotkeys } from "@/composables/useHotkeys";
import AppButton from "@/components/common/AppButton.vue";

const { open } = defineProps<{
  open: boolean;
  pageId?: string | null;
  geminiApiKey?: string | null;
  campaignId?: string | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

// Registering at the overlay layer does two jobs: Escape closes the dialog, and
// the soundboard page's transport keys stop responding while it is open — so
// typing a sound name cannot pause the session's audio.
useHotkeys(
  [{ combo: "escape", description: "Close", handler: () => emit("close"), hidden: true }],
  { layer: "overlay", enabled: () => open },
);
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.15s ease;
}
.dialog-fade-enter-active .relative,
.dialog-fade-leave-active .relative {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
.dialog-fade-enter-from .relative,
.dialog-fade-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>
