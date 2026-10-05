<template>
  <div ref="triggerRef" class="flex w-fit">
    <AppButton
      variant="ghost"
      size="icon-xs"
      :class="ICON_TOUCH_TARGET"
      :icon="IconMore"
      icon-size="xs"
      :aria-label="`More actions for ${item.name}`"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="open = !open"
    />
  </div>

  <!-- Teleported: the inventory cards clip overflow, which would cut the menu off. -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      :style="floatingStyle"
      class="z-300 w-60 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
      role="dialog"
      :aria-label="`Actions for ${item.name}`"
    >
      <AppButton variant="menu" size="sm" block class="rounded-none" label="Drop to chat" @click="pick('drop-to-chat')">
        <template #icon><IconArrowUp class="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></template>
      </AppButton>
      <AppButton
        v-if="item.quantity > 1"
        variant="menu"
        size="sm"
        block
        class="rounded-none"
        label="Split stack"
        @click="pick('split-stack')"
      >
        <template #icon><IconScissors class="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></template>
      </AppButton>
      <AppButton v-if="sellable" variant="menu" size="sm" block class="rounded-none" label="List for sale" @click="pick('sell-item')">
        <template #icon><IconShop class="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></template>
      </AppButton>

      <template v-if="moveTargets.length">
        <p class="px-3 pt-2 pb-1 text-label text-muted-foreground border-t border-border mt-1">Move to</p>
        <AppButton
          v-for="target in moveTargets"
          :key="target.key"
          variant="menu"
          size="sm"
          block
          class="rounded-none"
          :label="target.label"
          @click="move(target)"
        />
      </template>

      <AppButton
        variant="menu"
        tone="danger"
        size="sm"
        block
        class="rounded-none border-t border-border mt-1"
        label="Remove"
        @click="pick('remove')"
      >
        <template #icon><IconDelete class="h-3.5 w-3.5 shrink-0" /></template>
      </AppButton>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The inventory row's overflow menu. On a phone the name had to share its row
 * with five icon buttons and truncated to a few letters, so the secondary
 * actions live here instead, plus "Move to…" so moving an item does not depend
 * on dragging it (a touch drag fights the page scroll).
 */
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { ICON_TOUCH_TARGET } from "@/components/common/appButtonVariants";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { IconArrowUp, IconDelete, IconMore, IconScissors, IconShop } from "@/lib/icons";
import type { InventoryLocation, PartyInventoryItem } from "@/types/inventory.types";

export interface MoveTarget {
  key: string;
  label: string;
  location: InventoryLocation | "stash";
  containerId: string | null;
}

const { item, moveTargets } = defineProps<{
  item: PartyInventoryItem;
  sellable?: boolean;
  moveTargets: MoveTarget[];
}>();

const emit = defineEmits<{
  "drop-to-chat": [];
  "split-stack": [];
  "sell-item": [];
  remove: [];
  move: [location: InventoryLocation | "stash", containerId: string | null];
}>();

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => {
  open.value = false;
});

function pick(action: "drop-to-chat" | "split-stack" | "sell-item" | "remove") {
  open.value = false;
  if (action === "drop-to-chat") emit("drop-to-chat");
  else if (action === "split-stack") emit("split-stack");
  else if (action === "sell-item") emit("sell-item");
  else emit("remove");
}

function move(target: MoveTarget) {
  open.value = false;
  emit("move", target.location, target.containerId);
}
</script>
