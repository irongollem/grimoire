<script setup lang="ts">
/**
 * A provider_config model column that names its own model for one use and
 * falls back to a general one when empty: the fast text model, the map
 * styler's and the Chronicler's image models. Empty is a real setting
 * ("fall back"), so the parent saves a blank box as null, never "".
 */
import AppInput from "@/components/common/AppInput.vue";

const { label, listId, options, placeholder, hint } = defineProps<{
  label: string;
  /** Unique per field and provider: the datalist id the input points at. */
  listId: string;
  /** Suggestions only, never enforced; absent until the provider's model list loads. */
  options?: readonly string[];
  placeholder: string;
  hint: string;
}>();

const model = defineModel<string | null>({ required: true });
</script>

<template>
  <div class="space-y-1">
    <label class="block text-label text-muted-foreground">{{ label }}</label>
    <AppInput
      v-model="model"
      :list="listId"
      type="text"
      size="caption"
      class="font-mono"
      :placeholder="placeholder"
    />
    <datalist :id="listId">
      <option v-for="m in options" :key="m" :value="m" />
    </datalist>
    <p class="text-caption-sm text-muted-foreground/60 italic">{{ hint }}</p>
  </div>
</template>
