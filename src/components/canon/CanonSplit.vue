<template>
  <div class="canon-split grid min-w-0 grid-cols-1 items-start gap-4" :class="isOpen() ? '@4xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @4xl:gap-6' : ''" :data-split-open="isOpen() ? '' : undefined">
    <slot />
    <!-- Beside the ledger from a wide page body, under it below that: the page scrolls to this when a tap opens it. -->
    <div v-if="isOpen()" id="canon-inline-detail" class="flex min-w-0 flex-col gap-2" data-testid="canon-split-detail">
      <div class="flex justify-end">
        <AppButton variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="closeLabel" data-testid="canon-split-close" @click="emit('close')" />
      </div>
      <slot name="detail" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A ledger with its open entry beside it (#1255, the Backstories rule for every part whose entry is too long for the
 * side column): the ledger takes a third of the page body and the entry two thirds from a container width of 56rem,
 * and the entry sits under the ledger below that. Nothing is drawn beside the ledger until a `detail` is given. The
 * body of the page reads `data-split-open` to widen itself, and the page scrolls to `#canon-inline-detail` after a tap.
 */
import { useSlots } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconClose } from "@/lib/icons";

const { closeLabel = "Close this entry" } = defineProps<{ closeLabel?: string }>();
const emit = defineEmits<{ close: [] }>();

const slots = useSlots();
// Read at render, never cached: `slots` is not reactive, and a detail appears when a row is tapped.
const isOpen = () => slots.detail !== undefined;
</script>
