<template>
  <!--
    Native <select> wrapper for filter rows. Keeps the OS-provided picker
    (which works well on mobile) but normalizes the dark-app styling that
    was duplicated across 7 list views.

    Consumers pass <option> elements through the default slot so both the
    "empty" placeholder value (often "" or "all") and the order of options
    stay the caller's choice.

    The control is ≥44px tall on mobile (min-h-11) for a comfortable tap
    target; on ≥md the height reverts to py-1.5 (md:min-h-0) as before.
  -->
  <select
    v-model="model"
    class="bg-card border border-border rounded-md px-2 min-h-11 py-1.5 md:min-h-0 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
    :aria-label="ariaLabel"
  >
    <slot />
  </select>
</template>

<script setup lang="ts">
const model = defineModel<string>({ required: true });
defineProps<{
  ariaLabel?: string;
}>();
</script>
