<template>
  <!--
    Bottom-sheet primitive for the mobile-only UI layer (<md).
    Rises from the bottom over a dimmed backdrop. Teleported to <body> so it
    escapes any list/card overflow clipping. Close on backdrop tap or ✕.

    Slots:
      - default  — sheet body (scrolls if it exceeds max-h)
      - footer   — pinned action row (e.g. "Clear all" / "Show N")
  -->
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex flex-col justify-end md:hidden"
        role="dialog"
        aria-modal="true"
      >
        <!-- Dimmed backdrop -->
        <div class="absolute inset-0 bg-black/60" @click="open = false" />

        <!-- Sheet panel -->
        <div
          class="sheet-panel relative flex max-h-[80vh] flex-col rounded-t-2xl border-t border-border bg-card"
        >
          <!-- Grip handle -->
          <div class="flex shrink-0 justify-center pt-2.5 pb-1">
            <div class="h-1 w-10 rounded-full bg-border" />
          </div>

          <!-- Title row -->
          <div
            v-if="title"
            class="flex shrink-0 items-center justify-between gap-3 px-4 pb-2"
          >
            <h2
              class="font-cinzel text-base font-bold tracking-wide text-foreground"
            >
              {{ title }}
            </h2>
            <button
              type="button"
              class="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Close"
              @click="open = false"
            >
              <IconClose class="size-5" />
            </button>
          </div>

          <!-- Body -->
          <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
            <slot />
          </div>

          <!-- Footer (optional) -->
          <div
            v-if="$slots.footer"
            class="shrink-0 border-t border-border px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <slot name="footer" />
          </div>
          <div v-else class="shrink-0 pb-safe" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { IconClose } from "@/lib/icons";

const open = defineModel<boolean>("open", { required: true });
defineProps<{ title?: string }>();
</script>

<style scoped>
/* Backdrop fades; panel rises. Keyframes keep it independent of util classes. */
.sheet-enter-active .sheet-panel {
  animation: sheet-rise 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

@keyframes sheet-rise {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
</style>
