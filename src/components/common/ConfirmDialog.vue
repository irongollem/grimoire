<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="dialog"
        class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="cancel"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <!-- Panel -->
        <div
          class="relative w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="'dialog-title'"
        >
          <!-- Header -->
          <div class="flex items-start gap-3 px-5 pt-5 pb-3">
            <div
              class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full"
              :class="
                dialog.danger
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-primary/15 text-primary'
              "
            >
              <AlertTriangle v-if="dialog.danger" class="h-4.5 w-4.5" />
              <Info v-else class="h-4.5 w-4.5" />
            </div>
            <div class="flex-1 min-w-0">
              <h2
                id="dialog-title"
                class="font-cinzel text-sm font-bold text-foreground tracking-wide"
              >
                {{ dialog.title }}
              </h2>
              <p
                class="mt-1 font-fell text-sm text-muted-foreground leading-snug"
              >
                {{ dialog.message }}
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex justify-end gap-2 px-5 pb-5 pt-2">
            <button
              v-if="dialog.type === 'confirm'"
              type="button"
              class="px-4 py-1.5 rounded-md border border-border font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors tracking-wider"
              @click="cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              class="px-4 py-1.5 rounded-md font-cinzel text-xs font-semibold tracking-wider transition-colors"
              :class="
                dialog.danger
                  ? 'bg-destructive text-destructive-foreground hover:opacity-90'
                  : 'bg-primary text-primary-foreground hover:opacity-90'
              "
              @click="ok"
            >
              {{ dialog.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { AlertTriangle, Info } from "lucide-vue-next";
import { useConfirm } from "@/composables/useConfirm";

const { dialog, _resolve } = useConfirm();

function ok() {
  _resolve(true);
}
function cancel() {
  _resolve(false);
}
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.15s ease;
}
.dialog-fade-enter-active .relative,
.dialog-fade-leave-active .relative {
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
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
