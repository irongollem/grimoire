<template>
  <AppModal :open="fact !== null" size="md" @close="emit('close')">
    <ModalHeader title="Correct this" subtitle="The record keeps both: your correction overtakes the old sentence and does not replace it." closeable @close="emit('close')" />
    <form class="flex flex-col gap-3 px-5 py-4" @submit.prevent="save">
      <div class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">The record says</span>
        <p class="text-body text-foreground" data-testid="correct-original">{{ fact?.body }}</p>
      </div>
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">What is true instead</span>
        <AppInput v-model="typed" block maxlength="600" autocomplete="off" />
      </label>
      <p v-if="shownProblem" role="alert" class="text-caption text-destructive">{{ shownProblem }}</p>
      <div class="flex justify-end gap-2">
        <AppButton variant="ghost" size="md" label="Cancel" @click="emit('close')" />
        <AppButton type="submit" variant="primary" size="md" label="Save correction" :loading="saving" :disabled="problem !== null" />
      </div>
    </form>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { checkCorrection, type StoryFact } from "@/lib/table/storyRecord";

const { fact, saving = false } = defineProps<{ fact: StoryFact | null; saving?: boolean }>();
const emit = defineEmits<{ close: []; save: [fact: StoryFact, typed: string] }>();

const typed = ref("");
// A reopened dialog starts from the sentence it is correcting, not from the last thing typed.
watch(() => fact?.id, () => {
  typed.value = fact?.body ?? "";
});

const problem = computed(() => {
  if (!fact) return null;
  const checked = checkCorrection(fact.body, typed.value);
  return checked.ok ? null : checked.reason;
});

// Nothing is said until something has been changed, so the untouched field is not an error on first sight.
const shownProblem = computed(() => (typed.value === fact?.body ? null : problem.value));

function save(): void {
  if (!fact || problem.value !== null) return;
  emit("save", fact, typed.value);
}
</script>
