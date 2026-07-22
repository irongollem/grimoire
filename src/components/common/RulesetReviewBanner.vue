<template>
  <div
    class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
    role="status"
  >
    <slot />
    <RouterLink class="ml-1 underline font-semibold" :to="linkTo">{{ linkLabel }}</RouterLink>
    <button
      type="button"
      class="ml-2 underline font-semibold disabled:opacity-50"
      :disabled="acknowledging"
      @click="$emit('acknowledge')"
    >{{ ackLabel }}</button>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";

const { linkTo, linkLabel, ackLabel, acknowledging = false } = defineProps<{
  linkTo: string;
  linkLabel: string;
  ackLabel: string;
  acknowledging?: boolean;
}>();

defineEmits<{ acknowledge: [] }>();
</script>
