<template>
  <CautionNotice>
    <slot />
    <RouterLink class="ml-1 underline font-semibold" :to="linkTo">{{ linkLabel }}</RouterLink>
    <button
      type="button"
      class="ml-2 underline font-semibold disabled:opacity-50"
      :disabled="acknowledging"
      @click="$emit('acknowledge')"
    >{{ ackLabel }}</button>
  </CautionNotice>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import CautionNotice from "@/components/common/feedback/CautionNotice.vue";

const { linkTo, linkLabel, ackLabel, acknowledging = false } = defineProps<{
  linkTo: string;
  linkLabel: string;
  ackLabel: string;
  acknowledging?: boolean;
}>();

defineEmits<{ acknowledge: [] }>();
</script>
