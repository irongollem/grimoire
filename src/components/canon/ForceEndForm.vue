<template>
  <form class="flex min-w-0 flex-col gap-2" data-testid="force-end-form" @submit.prevent="emit('end', outcome, note)">
    <SegmentedControl v-model="outcome" :options="FORCE_OUTCOME_OPTIONS" size="sm" wrap aria-label="How it ended" />
    <AppInput v-model="note" size="body" tone="filled" aria-label="What became of it" placeholder="What became of it, if you want to say…" />
    <div class="flex flex-wrap gap-2">
      <AppButton type="submit" variant="primary" size="sm" label="End it" />
      <AppButton type="button" variant="ghost" size="sm" label="Cancel" @click="emit('cancel')" />
    </div>
  </form>
</template>

<script setup lang="ts">
/** The inline form that ends a force: the outcome, an optional line on what became of it, and End it or Cancel. */
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { FORCE_OUTCOME_OPTIONS, type ForceOutcome } from "@/lib/canon/canonClose";

const emit = defineEmits<{ end: [outcome: ForceOutcome, note: string]; cancel: [] }>();

const outcome = ref<ForceOutcome>("stopped");
const note = ref("");
</script>
