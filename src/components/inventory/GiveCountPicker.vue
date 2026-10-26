<template>
  <div class="flex flex-col gap-2">
    <p class="text-caption text-foreground">How many to {{ targetName }}?</p>
    <div class="flex items-center gap-1.5">
      <AppButton
        variant="subtle"
        size="icon-xs"
        :icon="IconMinus"
        icon-size="xs"
        aria-label="One fewer"
        :disabled="count <= 1"
        @click="count = clamp(count - 1)"
      />
      <AppInput
        :model-value="String(count)"
        type="number"
        min="1"
        :max="quantity"
        size="body-xs"
        align="center"
        :aria-label="`How many ${name} to give`"
        @update:model-value="(v) => (count = clamp(Number(v)))"
      />
      <AppButton
        variant="subtle"
        size="icon-xs"
        :icon="IconAdd"
        icon-size="xs"
        aria-label="One more"
        :disabled="count >= quantity"
        @click="count = clamp(count + 1)"
      />
    </div>
    <div class="flex gap-2">
      <AppButton
        variant="primary"
        size="sm"
        class="flex-1"
        :label="shortLabel ? `Give ${count}` : `Give ${count} to ${targetName}`"
        @click="confirm"
      />
      <AppButton variant="subtle" size="sm" label="Back" @click="emit('back')" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The "How many to X?" step of a give menu: a stack asks how many before it moves.
 * Starts at the whole stack; confirming the whole stack emits null (move the row as it is).
 * The menu decides when to show it (a stack of plain items only).
 */
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { IconAdd, IconMinus } from "@/lib/icons";

const { name, quantity, targetName, shortLabel = false } = defineProps<{
  /** The item being given. */
  name: string;
  /** How many of it there are: the upper bound. */
  quantity: number;
  /** Who receives it. */
  targetName: string;
  /** The confirm button reads "Give N" instead of "Give N to <target>". */
  shortLabel?: boolean;
}>();

const emit = defineEmits<{
  /** `quantity` is null for the whole stack. */
  confirm: [quantity: number | null];
  back: [];
}>();

const count = ref(quantity);

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(quantity, Math.max(1, Math.floor(n)));
}

function confirm() {
  emit("confirm", count.value >= quantity ? null : count.value);
}
</script>
