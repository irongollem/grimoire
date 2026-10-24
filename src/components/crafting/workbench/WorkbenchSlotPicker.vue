<template>
  <MobileSheet v-if="isMobile" v-model:open="open" :title="slot.name">
    <WorkbenchSlotPickerBody v-bind="bodyProps" @choose="emit('choose', $event)" @done="open = false" />
  </MobileSheet>

  <Teleport v-else to="body">
    <div
      v-if="open"
      ref="floatingRef"
      :style="floatingStyle"
      role="dialog"
      :aria-labelledby="titleId"
      data-slip class="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-3 shadow-xl"
    >
      <WorkbenchSlotPickerBody v-bind="bodyProps" @choose="emit('choose', $event)" @done="open = false" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import MobileSheet from "@/components/common/overlays/MobileSheet.vue";
import WorkbenchSlotPickerBody from "@/components/crafting/workbench/WorkbenchSlotPickerBody.vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { useIsMobile } from "@/composables/useBreakpoint";
import type { IngredientSlot } from "@/lib/crafting/ingredients";

/**
 * What a dish needs and which item fills it. An anchored slip beside the dish on a desktop,
 * a bottom sheet on a phone. Choosing writes straight away; "Use this" only closes.
 */
const { slot, total, anchor, chosenId, memberId, memberName } = defineProps<{
  slot: IngredientSlot;
  total: number;
  /** The dish's button: the popover hangs off it and focus returns to it on close. */
  anchor: Element | null;
  chosenId: string | undefined;
  memberId: string;
  memberName: string;
}>();

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ choose: [rowId: string] }>();

const isMobile = useIsMobile();
const titleId = useId();

const bodyProps = computed(() => ({ slot, total, chosenId, memberId, memberName, titleId }));

const anchorRef = ref<Element | null>(null);
watch(
  () => anchor,
  (a) => (anchorRef.value = a),
  { immediate: true },
);
const { floatingRef, floatingStyle } = useAnchoredPopover(anchorRef, open, () => (open.value = false));

// Escape and "Use this" both land back on the dish that was opened.
watch(open, (isOpen, wasOpen) => {
  if (wasOpen && !isOpen && anchor instanceof HTMLElement) anchor.focus();
});
</script>
