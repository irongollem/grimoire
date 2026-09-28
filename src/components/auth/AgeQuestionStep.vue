<template>
  <div class="space-y-4">
    <BirthMonthField v-model:month="birthMonth" v-model:year="birthYear" legend="Birth month and year" />
    <p v-if="ageError" class="text-body text-destructive">{{ ageError }}</p>
    <AppButton
      variant="primary"
      size="lg"
      block
      :class="buttonClass"
      label="Continue"
      @click="handleContinue"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The age question every account-creating form asks first (#919), as its own
 * step: the birth-month/year fields, the error line, and the button that
 * resolves them. Shared by `SignupView` and `JoinCampaignView` — the two
 * places the question is a standalone step rather than embedded in a larger
 * form (`TermsGate` uses `useAgeQuestion` directly for that reason).
 *
 * Owns its own birth-month/year state: no caller reads it back, only the
 * resolution.
 */
import { useAgeQuestion } from "@/composables/auth/useAgeQuestion";
import AppButton from "@/components/common/AppButton.vue";
import BirthMonthField from "@/components/auth/BirthMonthField.vue";

const { buttonClass = "" } = defineProps<{
  /** JoinCampaignView's tab layout wants its buttons a touch taller
   *  (`py-2.5`) than SignupView's plain form does — passed through rather
   *  than baked in, so this stays a faithful extraction of both. */
  buttonClass?: string;
}>();

const emit = defineEmits<{ adult: []; under16: [] }>();

const { birthMonth, birthYear, ageError, resolveAge } = useAgeQuestion();

function handleContinue() {
  const result = resolveAge();
  if (result === "adult") emit("adult");
  else if (result === "under16") emit("under16");
}
</script>
