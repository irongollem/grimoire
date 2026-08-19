<template>
  <div>
    <AppInput
      :model-value="modelValue === null ? '' : modelValue"
      :list="listId"
      :placeholder="placeholder"
      maxlength="60"
      tone="filled"
      size="body"
      @update:model-value="emitValue(String($event))"
    />
    <datalist :id="listId">
      <option v-for="option in suggestions" :key="option" :value="option" />
    </datalist>
  </div>
</template>

<script setup lang="ts">
// Free-text label with suggestions — deliberately not EntityCombobox.
//
// The surface is `tone="filled"`, not the `bg-input` this used to hand-roll.
// `--input` is a scaffold token: exactly two fields in the app ever used it as a
// *surface* (this one and the playlist name field), against roughly 250 that use
// background, card or muted. Its other role — `border-input` — is alive and well
// in a dozen places, which is what kept the token looking load-bearing. Two sites
// choosing a surface nothing else chooses is drift, and a tone for two call sites
// would be the same mistake as a switch size for six.
//
// A theme is a label, not a reference to a row, and the DM must be able to type
// one that does not exist yet: labelling the encounter before building the
// playlist that answers it is a perfectly reasonable order to work in. A
// combobox that only offers existing options would make that impossible, so
// this is an input whose datalist merely suggests.
import { useId } from "vue";
import AppInput from "@/components/common/AppInput.vue";

const { modelValue, suggestions, placeholder = "battle, tavern…" } = defineProps<{
  modelValue: string | null;
  /** Labels already in use elsewhere, offered as completions. */
  suggestions: readonly string[];
  placeholder?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string | null] }>();

const listId = `theme-suggestions-${useId()}`;

/** Blank means "no theme", which is null — an empty string would be a lie. */
function emitValue(raw: string): void {
  emit("update:modelValue", raw.trim() === "" ? null : raw);
}
</script>
