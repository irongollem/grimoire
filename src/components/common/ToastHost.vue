<template>
  <Teleport to="body">
    <div class="fixed inset-x-0 bottom-0 z-300 flex flex-col items-center gap-2 p-4 pointer-events-none sm:items-end">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border bg-card px-3.5 py-2.5 shadow-xl"
          :class="borderClass(t.type)"
          role="status"
          aria-live="polite"
        >
          <component :is="icon(t.type)" class="mt-0.5 h-4 w-4 shrink-0" :class="iconClass(t.type)" />
          <p class="flex-1 font-fell text-sm leading-snug text-foreground">{{ t.message }}</p>
          <button
            type="button"
            class="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dismiss"
            @click="dismiss(t.id)"
          >
            <IconClose class="h-3.5 w-3.5" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { watch } from "vue";
import { IconClose, IconCloseCircle, IconCheckCircle, IconInfo } from "@/lib/icons";
import { useToast, type ToastType } from "@/composables/useToast";

const { toasts, dismiss } = useToast();

// Track which toasts already have a pending auto-dismiss timer so the watcher
// doesn't double-schedule when the array changes.
const timers = new Set<number>();

watch(
  toasts,
  (list) => {
    for (const t of list) {
      if (t.duration > 0 && !timers.has(t.id)) {
        timers.add(t.id);
        setTimeout(() => {
          dismiss(t.id);
          timers.delete(t.id);
        }, t.duration);
      }
    }
  },
  { deep: true, immediate: true },
);

function icon(type: ToastType) {
  if (type === "error") return IconCloseCircle;
  if (type === "success") return IconCheckCircle;
  return IconInfo;
}
function borderClass(type: ToastType) {
  if (type === "error") return "border-destructive/40";
  if (type === "success") return "border-elven-green/40";
  return "border-border";
}
function iconClass(type: ToastType) {
  if (type === "error") return "text-destructive";
  if (type === "success") return "text-elven-green";
  return "text-primary";
}
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(0.75rem);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}
.toast-move {
  transition: transform 0.2s ease;
}
</style>
