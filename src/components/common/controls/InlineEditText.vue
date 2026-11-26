<template>
  <AppInput
    v-if="editing"
    ref="field"
    v-model="draft"
    :size="size"
    :maxlength="maxlength"
    :aria-label="ariaLabel"
    :placeholder="placeholder"
    @keydown.enter.prevent="finish(true)"
    @keydown.esc.prevent="finish(false)"
    @blur="finish(true)"
  />
  <!-- Bare button: no padding, border or radius of its own, so not a hand-rolled control. -->
  <button
    v-else
    ref="view"
    type="button"
    :aria-label="ariaLabel"
    class="inline-edit-text max-w-full text-left hover:underline hover:decoration-dotted focus-visible:underline focus-visible:decoration-dotted"
    :class="[textClass, shown ? '' : 'italic text-muted-foreground']"
    @click="open"
  >
    {{ shown || placeholder }}
  </button>
</template>

<script setup lang="ts">
/**
 * Click-to-edit single line (#1283): the text is the control. Clicking it, or
 * Enter / Space on it, swaps in an AppInput; Enter or blur commits, Escape
 * cancels. Emits `commit` only when the trimmed value really changed.
 */
import { computed, nextTick, ref, useTemplateRef } from "vue";
import AppInput from "./AppInput.vue";
import type { FieldSize } from "./fieldVariants";

const {
  modelValue,
  placeholder,
  ariaLabel,
  maxlength,
  required = false,
  size = "sm",
  textClass = "",
} = defineProps<{
  modelValue: string | null;
  placeholder: string;
  ariaLabel: string;
  maxlength?: number;
  /** A blank value is refused: the old one is kept and nothing is emitted. */
  required?: boolean;
  size?: FieldSize;
  /** Classes for the view text, so a caller can set it as a letterhead. */
  textClass?: string;
}>();

const emit = defineEmits<{ commit: [value: string | null] }>();

const editing = ref(false);
const draft = ref("");
// AppInput is generic, so its instance type is named by what it exposes.
const field = useTemplateRef<{ focus: () => void; select: () => void }>("field");
const view = useTemplateRef<HTMLButtonElement>("view");
const shown = computed(() => modelValue ?? "");

async function open() {
  draft.value = shown.value;
  editing.value = true;
  await nextTick();
  field.value?.focus();
  field.value?.select();
}

async function finish(save: boolean) {
  // Unmounting the field fires a blur; the first call has already closed it.
  if (!editing.value) return;
  editing.value = false;
  if (save) {
    const next = draft.value.trim();
    const blockedBlank = required && next === "";
    if (!blockedBlank && next !== shown.value.trim()) emit("commit", next === "" ? null : next);
  }
  await nextTick();
  view.value?.focus();
}
</script>
