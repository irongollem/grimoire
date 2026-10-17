<template>
  <div ref="triggerRef" class="flex w-fit shrink-0">
    <slot name="trigger" :open="open" :toggle="toggle" />
  </div>

  <!-- Teleported to the body and fixed to the trigger: the workbench is a stack of
       isolated cards, and a panel that stayed inside one was painted over by the
       next (the Dressing sources picker hid behind the Spaces panel). -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      :style="floatingStyle"
      data-slip
      :class="cn('z-300 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover p-3 shadow-lg', widthClass)"
      role="dialog"
      :aria-label="label"
    >
      <slot :close="close" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// One popover for everything the workbench bar opens (tile sets, map settings).
// `useAnchoredPopover` owns placement, outside-click and Escape.
import { ref } from "vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { cn } from "@/lib/utils";

const { label, widthClass = "w-72" } = defineProps<{
  /** Accessible name of the panel. */
  label: string;
  widthClass?: string;
}>();

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => {
  open.value = false;
});

function toggle(): void {
  open.value = !open.value;
}
function close(): void {
  open.value = false;
}
</script>
