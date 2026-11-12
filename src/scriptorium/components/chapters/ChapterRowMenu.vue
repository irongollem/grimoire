<template>
  <div ref="triggerRef" class="flex w-fit">
    <AppButton
      variant="subtle"
      size="icon-xs"
      :class="ICON_TOUCH_TARGET"
      :icon="IconMore"
      icon-size="xs"
      :aria-label="`Actions for ${title}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    />
  </div>

  <!-- Teleported: the rail scrolls and would clip a menu that overflows it. -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      :style="floatingStyle"
      data-slip
      role="menu"
      :aria-label="`Actions for ${title}`"
      class="z-300 w-48 rounded-md border border-border bg-popover py-1 shadow-lg"
    >
      <AppButton role="menuitem" variant="menu" size="sm" block class="rounded-none" label="Move up" :disabled="first" @click="pick('moveUp')" />
      <AppButton role="menuitem" variant="menu" size="sm" block class="rounded-none" label="Move down" :disabled="last" @click="pick('moveDown')" />
      <AppButton
        v-if="canDelete"
        role="menuitem"
        variant="menu"
        tone="danger"
        size="sm"
        block
        class="rounded-none"
        label="Delete chapter"
        @click="pick('delete')"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/** The row's ⋯ menu: the keyboard and phone route to everything the grip's drag does, plus Delete. */
import { nextTick, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { ICON_TOUCH_TARGET } from "@/components/common/controls/appButtonVariants";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { IconMore } from "@/lib/icons";

defineProps<{
  title: string;
  first: boolean;
  last: boolean;
  /** False for the only chapter: a book keeps at least one. */
  canDelete: boolean;
}>();

const emit = defineEmits<{ moveUp: []; moveDown: []; delete: [] }>();

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => close());

function close() {
  if (!open.value) return;
  open.value = false;
  triggerRef.value?.querySelector("button")?.focus();
}
function toggle() {
  open.value = !open.value;
}
function pick(action: "moveUp" | "moveDown" | "delete") {
  open.value = false;
  if (action === "moveUp") emit("moveUp");
  else if (action === "moveDown") emit("moveDown");
  else emit("delete");
}

watch(open, async (isOpen) => {
  if (!isOpen) return;
  await nextTick();
  floatingRef.value?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
});
</script>
