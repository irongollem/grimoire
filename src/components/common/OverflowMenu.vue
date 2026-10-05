<template>
  <div ref="triggerRef" class="flex w-fit">
    <AppButton
      variant="subtle"
      size="icon-sm"
      :class="ICON_TOUCH_TARGET"
      :icon="IconMore"
      :aria-label="label"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :disabled="disabled"
      @click="open = !open"
    />
  </div>

  <!-- Teleported: cards clip overflow, which would cut the menu off. -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      :style="floatingStyle"
      class="z-300 w-56 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
      role="dialog"
      :aria-label="label"
    >
      <AppButton
        v-for="(entry, i) in items"
        :key="entry.key"
        variant="menu"
        :tone="entry.danger ? 'danger' : undefined"
        size="md"
        block
        :class="['rounded-none', entry.danger && i > 0 ? 'border-t border-border mt-1' : '']"
        :label="entry.label"
        :disabled="entry.disabled"
        @click="pick(entry.key)"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * A small overflow menu for the secondary actions of a card, so the card keeps
 * one or two clear primary buttons at touch size. List a destructive entry
 * last: it is separated from the rest by a rule.
 */
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { ICON_TOUCH_TARGET } from "@/components/common/appButtonVariants";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { IconMore } from "@/lib/icons";

export interface OverflowMenuEntry {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
}

const { label, items, disabled } = defineProps<{
  /** Accessible name of the trigger and the menu, e.g. "More actions for Chicory". */
  label: string;
  items: readonly OverflowMenuEntry[];
  disabled?: boolean;
}>();

const emit = defineEmits<{ select: [key: string] }>();

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => {
  open.value = false;
});

function pick(key: string) {
  open.value = false;
  emit("select", key);
}
</script>
