<template>
  <EmptyState
    title="The ritual fizzles"
    description="The simulacrum collapses into mist — the binding sigils are not yet inscribed. The ritual to bind a true simulacrum is still being researched."
  >
    <template #icon><VitruvianIcon class="text-6xl" label="Simulacrum" /></template>
    <template #action>
      <p v-if="interestQuery.data.value" class="font-fell text-sm text-primary">
        Your sigil is inscribed — you will be told when the ritual is ready.
      </p>
      <button
        v-else
        type="button"
        :disabled="register.isPending.value"
        class="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        @click="notify"
      >
        {{ register.isPending.value ? 'Inscribing…' : 'Notify me when the ritual is complete' }}
      </button>
    </template>
  </EmptyState>
</template>

<script setup lang="ts">
import EmptyState from "@/components/common/EmptyState.vue";
import VitruvianIcon from "@/components/common/VitruvianIcon.vue";
import { useMyFeatureInterest, useRegisterFeatureInterest } from "@/composables/useFeatureInterest";
import { SIMULACRUM_FEATURE_KEY } from "@/types/mini.types";

const interestQuery = useMyFeatureInterest(SIMULACRUM_FEATURE_KEY);
const register = useRegisterFeatureInterest();

function notify() {
  register.mutate(SIMULACRUM_FEATURE_KEY);
}
</script>
