<template>
  <form class="flex flex-col gap-2 border border-border bg-card p-3" data-testid="record-add" @submit.prevent="submit">
    <label class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Put something on the record</span>
      <AppInput v-model="typed" block maxlength="600" autocomplete="off" placeholder="One plain sentence about what is true" />
    </label>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <AppCheckbox v-model="hidden" label="The party does not know this yet" />
      <AppButton type="submit" variant="outline" size="md" label="Add to the record" :loading="saving" :disabled="typed.trim() === ''" />
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";

const { saving = false } = defineProps<{ saving?: boolean }>();
const emit = defineEmits<{ add: [typed: string, hidden: boolean, done: () => void] }>();

const typed = ref("");
const hidden = ref(false);

// The field empties only once the fact is on record, so a failed save does not lose what was typed.
function submit(): void {
  if (typed.value.trim() === "") return;
  emit("add", typed.value, hidden.value, () => {
    typed.value = "";
    hidden.value = false;
  });
}
</script>
