<template>
  <AppButton
    variant="ghost"
    fill="muted"
    size="xs"
    class="size-14 shrink-0 overflow-hidden rounded-md border border-border bg-card p-0.5"
    :class="selected ? 'ring-2 ring-primary' : ''"
    :active="selected"
    :aria-pressed="selected"
    :tooltip="label"
    :aria-label="label"
    @click="emit('pick')"
  >
    <slot />
  </AppButton>
</template>

<script setup lang="ts">
// A square thumbnail the Place catalogue offers: a picture, a name on hover, and a ring
// in the accent when it is the armed item. The picture is the slot (a tile canvas, a prop
// image, or the "Any" word), so every kind of choice looks and behaves alike.
import AppButton from "@/components/common/controls/AppButton.vue";

defineProps<{
  /** The tile's name: its tooltip and its accessible name. */
  label: string;
  selected: boolean;
}>();

const emit = defineEmits<{ pick: [] }>();
</script>
