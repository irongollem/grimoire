<template>
  <form class="flex flex-wrap gap-2" @submit.prevent="submit">
    <AppInput v-model="draft" tone="filled" size="body" class="min-w-0 flex-1" :placeholder="placeholder" :aria-label="inputLabel" />
    <slot />
    <AppButton type="submit" variant="outline" class="whitespace-nowrap" :icon="IconAdd" icon-size="xs" :label="label" :loading="busy" :disabled="draft.trim() === ''" />
  </form>
</template>

<script setup lang="ts">
/**
 * The add row under a canon list: one line of words and an Add button that stays off until there are some. `create`
 * receives the trimmed words and resolves when the entry is made; it throws when it is not, and then the words stay in
 * the box to try again. Anything beside the words (a kind picker) goes in the slot.
 */
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { IconAdd } from "@/lib/icons";

const { placeholder, inputLabel, label, create } = defineProps<{
  placeholder: string;
  inputLabel: string;
  /** The button's label. */
  label: string;
  create: (title: string) => Promise<void>;
}>();
/** The words in the box, shared with a parent that drafts from them. */
const draft = defineModel<string>({ default: "" });

const busy = ref(false);

async function submit() {
  const title = draft.value.trim();
  if (title === "" || busy.value) return;
  busy.value = true;
  try {
    await create(title);
    draft.value = "";
  } catch {
    // The mutation has already told the DM (toast); the words stay in the box to try again.
  } finally {
    busy.value = false;
  }
}
</script>
