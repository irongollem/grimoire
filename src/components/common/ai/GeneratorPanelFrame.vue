<template>
  <Transition name="fade" appear>
    <div
      v-if="open"
      class="fixed inset-0 bg-black/60 z-40"
      @click="emit('close')"
    />
  </Transition>

  <Transition name="slide-right" appear>
    <aside
      v-if="open"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-heading-sm font-semibold text-foreground">{{ title }}</h2>
        <AppButton
          variant="ghost"
          size="inline-xs"
          icon-size="lg"
          :icon="IconClose"
          tooltip="Close"
          aria-label="Close"
          @click="emit('close')"
        />
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <slot />
      </div>

      <!-- Footer: only drawn when the panel supplies one -->
      <div v-if="$slots.footer" class="px-5 py-4 border-t border-border flex flex-col gap-2 shrink-0">
        <slot name="footer" />
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
/**
 * The chrome of every AI generator sidebar and nothing else: click-away
 * overlay, slide-in panel, header with title and close button, a scrolling
 * body (`default` slot) and an optional footer bar (`footer` slot, drawn only
 * when given). No concept box, no AI state: those belong to
 * `GeneratorPanelShell`, which is built on this. Both the overlay and the
 * close button emit `close`; the owner decides what closing means.
 */
import { IconClose } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";

const { open, title } = defineProps<{
  open: boolean;
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.25s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}
</style>
