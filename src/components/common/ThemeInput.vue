<template>
  <div>
    <input
      :value="modelValue === null ? '' : modelValue"
      type="text"
      :list="listId"
      :placeholder="placeholder"
      maxlength="60"
      class="w-full rounded-md border border-border bg-input px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @input="emitValue(($event.target as HTMLInputElement).value)"
    />
    <datalist :id="listId">
      <option v-for="option in suggestions" :key="option" :value="option" />
    </datalist>
  </div>
</template>

<script setup lang="ts">
// Free-text label with suggestions — deliberately not EntityCombobox.
//
// A theme is a label, not a reference to a row, and the DM must be able to type
// one that does not exist yet: labelling the encounter before building the
// playlist that answers it is a perfectly reasonable order to work in. A
// combobox that only offers existing options would make that impossible, so
// this is an input whose datalist merely suggests.
import { useId } from "vue";

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
