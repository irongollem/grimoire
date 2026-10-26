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
      @click="toggle"
    />
  </div>

  <!-- Teleported: a pack column scrolls sideways and clips what overflows it. -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      :style="floatingStyle"
      data-slip
      class="z-300 w-60 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
      role="dialog"
      :aria-label="`Actions for ${item.name}`"
    >
      <!-- A stack asks how many first; a single thing or a container goes whole. -->
      <GiveCountPicker
        v-if="giving"
        class="px-3 py-2"
        :name="item.name"
        :quantity="item.quantity"
        :target-name="giving.name"
        short-label
        @confirm="confirmGive"
        @back="giving = null"
      />

      <template v-else>
        <p class="px-3 pt-1.5 pb-1 text-label text-muted-foreground">Give to</p>
        <AppButton
          v-for="target in giveTargets"
          :key="target.id ?? 'stash'"
          variant="menu"
          size="sm"
          block
          class="rounded-none"
          :label="target.name"
          @click="give(target)"
        />

        <div v-if="!item.is_container" class="mt-1 flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
          <span class="text-body text-foreground">Count</span>
          <span class="flex items-center gap-1.5">
            <AppButton variant="subtle" size="icon-xs" :icon="IconMinus" icon-size="xs" aria-label="One fewer" @click="$emit('count', -1)" />
            <span class="w-6 text-center text-label-lg font-bold text-foreground">{{ item.quantity }}</span>
            <AppButton variant="subtle" size="icon-xs" :icon="IconAdd" icon-size="xs" aria-label="One more" @click="$emit('count', 1)" />
          </span>
        </div>

        <div class="mt-1 border-t border-border">
          <AppButton
            variant="menu"
            size="sm"
            block
            class="rounded-none"
            :label="item.is_attuned ? 'Unattune' : 'Attune'"
            @click="pick('attune')"
          >
            <template #icon><IconStar class="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></template>
          </AppButton>
          <AppButton variant="menu" size="sm" block class="rounded-none" label="Drop in chat" @click="pick('drop')">
            <template #icon><IconArrowUp class="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></template>
          </AppButton>
          <AppButton
            v-if="packLink"
            variant="menu"
            size="sm"
            block
            class="rounded-none"
            :to="packLink"
            :label="`Open in ${carrierName}'s pack`"
            @click="open = false"
          >
            <template #icon><IconExternalLink class="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></template>
          </AppButton>
        </div>

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
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The DM's menu on a row in the Packs section (#1112): hand it to another pack, change
 * the count, attune, drop it in chat, open the carrier's pack, remove it. It is also the
 * keyboard and phone route to everything a drag does.
 */
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { ICON_TOUCH_TARGET } from "@/components/common/controls/appButtonVariants";
import GiveCountPicker from "@/components/inventory/GiveCountPicker.vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { IconAdd, IconArrowUp, IconDelete, IconExternalLink, IconMinus, IconMore, IconStar } from "@/lib/icons";
import type { PartyInventoryItem } from "@/types/inventory.types";

export interface PackGiveTarget {
  /** The receiving member, or null for the party stash. */
  id: string | null;
  name: string;
}

const { item, packLink = null } = defineProps<{
  item: PartyInventoryItem;
  /** Everywhere this row can go: the stash and each member but its carrier. */
  giveTargets: PackGiveTarget[];
  carrierName: string | null;
  packLink?: string | null;
}>();

const emit = defineEmits<{
  /** `quantity` is undefined for the whole row. */
  give: [toMemberId: string | null, quantity: number | undefined];
  count: [delta: number];
  attune: [];
  drop: [];
  remove: [];
}>();

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => {
  open.value = false;
});

const giving = ref<PackGiveTarget | null>(null);

function toggle() {
  giving.value = null;
  open.value = !open.value;
}

function give(target: PackGiveTarget) {
  if (item.quantity > 1 && !item.is_container) {
    giving.value = target;
    return;
  }
  open.value = false;
  emit("give", target.id, undefined);
}

function confirmGive(quantity: number | null) {
  const target = giving.value;
  if (!target) return;
  open.value = false;
  giving.value = null;
  emit("give", target.id, quantity ?? undefined);
}

function pick(action: "attune" | "drop" | "remove") {
  open.value = false;
  if (action === "attune") emit("attune");
  else if (action === "drop") emit("drop");
  else emit("remove");
}
</script>
