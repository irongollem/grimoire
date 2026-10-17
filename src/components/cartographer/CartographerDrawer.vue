<template>
  <!-- A phone has no spare edge: the drawer is a sheet there, like every other panel the
       app opens from the bottom. -->
  <MobileSheet v-if="belowLg" :open="open" :title="title" show-until="lg" @update:open="onSheet">
    <slot />
  </MobileSheet>

  <!-- Otherwise a slip laid over the canvas's right edge. It never shrinks the canvas:
       the map is the point, and a drawer is a thing you open, read and put away. The
       wrapper is the one `railTransition` collapses; the panel inside holds its width. -->
  <Transition v-else v-bind="railTransition()">
    <div v-if="open" class="absolute bottom-10 right-2 top-2 z-20 flex max-w-[calc(100%-1rem)]">
      <section
        data-slip
        class="flex h-full w-72 max-w-full shrink-0 flex-col rounded-md border border-border bg-card/95 shadow-lg"
        :aria-label="title"
      >
        <header class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
          <h3 class="text-label-lg font-semibold text-foreground">{{ title }}</h3>
          <AppButton
            variant="ghost"
            fill="muted"
            size="icon-xs"
            :icon="IconClose"
            :aria-label="`Close ${title}`"
            tooltip="Close"
            @click="emit('close')"
          />
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <slot />
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
// The workbench's one right drawer: Spaces, Dressing, or the Plan's regions and zones,
// one at a time (the host decides which and passes the title). Opens and closes through
// `src/lib/motion.ts`, which holds still for anyone who asked the OS for less motion.
import AppButton from "@/components/common/controls/AppButton.vue";
import MobileSheet from "@/components/common/overlays/MobileSheet.vue";
import { useBelow } from "@/composables/useBreakpoint";
import { IconClose } from "@/lib/icons";
import { railTransition } from "@/lib/motion";

defineProps<{
  open: boolean;
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();

const belowLg = useBelow("lg");

function onSheet(next: boolean): void {
  if (!next) emit("close");
}
</script>
