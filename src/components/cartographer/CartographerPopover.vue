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
      :style="style"
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
import { computed, ref, type CSSProperties } from "vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { cn } from "@/lib/utils";

const { label, widthClass = "w-72", alongRail = false } = defineProps<{
  /** Accessible name of the panel. */
  label: string;
  widthClass?: string;
  /** Open to the right of the trigger (above it below lg), for a trigger on the tool rail. */
  alongRail?: boolean;
}>();

// The rail lies along the bottom below lg (Tailwind's lg breakpoint).
const RAIL_BESIDE_MIN_WIDTH = 1024;
const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => {
  open.value = false;
});

const GAP = 8;
const style = computed<CSSProperties>(() => {
  const base = floatingStyle.value;
  const trigger = triggerRef.value;
  const floating = floatingRef.value;
  if (!alongRail || !trigger || !floating || base.visibility !== "visible") return base;
  const t = trigger.getBoundingClientRect();
  const w = floating.offsetWidth;
  const h = floating.offsetHeight;
  const beside = window.innerWidth >= RAIL_BESIDE_MIN_WIDTH;
  const clamp = (v: number, max: number) => Math.max(GAP, Math.min(v, max - GAP));
  return {
    ...base,
    left: `${beside ? t.right + GAP : clamp(t.left, window.innerWidth - w)}px`,
    top: `${beside ? clamp(t.top, window.innerHeight - h) : Math.max(GAP, t.top - h - GAP)}px`,
  };
});

function toggle(): void {
  open.value = !open.value;
}
function close(): void {
  open.value = false;
}
</script>
