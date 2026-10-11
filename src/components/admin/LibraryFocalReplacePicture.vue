<template>
  <div class="space-y-1">
    <AppButton
      variant="subtle"
      :loading="busy"
      :disabled="disabled"
      :label="hasPicture ? 'Replace picture' : 'Add picture'"
      @click="chooser?.click()"
    />
    <!-- A raw file input is the sanctioned exception: it carries no chrome. -->
    <input ref="chooser" type="file" accept="image/*" class="sr-only" tabindex="-1" @change="onChosen" />
    <p v-if="error" role="alert" class="text-caption text-destructive">Could not upload: {{ error }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Add or replace the picture of a species / background / class in the focal
 * queue (#965). The file is converted to WebP and stored under the library's
 * `srd/` prefix by the mutation; this only chooses the file and reports failure.
 */
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";

const { hasPicture, busy, disabled } = defineProps<{ hasPicture: boolean; busy: boolean; disabled: boolean }>();
const emit = defineEmits<{ chosen: [file: File] }>();
defineExpose({ setError });

const chooser = ref<HTMLInputElement | null>(null);
const error = ref<string | null>(null);

function setError(message: string | null) {
  error.value = message;
}

function onChosen(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.item(0);
  // Reset so choosing the same file again still fires `change`.
  input.value = "";
  if (!file) return;
  error.value = null;
  emit("chosen", file);
}
</script>
