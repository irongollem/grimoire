<template>
  <AppInput
    :model-value="modelValue ?? ''"
    :model-modifiers="{ lazy: true }"
    type="text"
    tone="bare"
    size="xs"
    :placeholder="placeholder"
    class="px-0 text-caption"
    @update:model-value="(value) => emit('commit', value as string)"
  />
</template>

<script setup lang="ts">
/**
 * The bare, borderless note line under a placement row — "what it's doing in
 * this room", "what opens it". Four copies of the same six-prop `AppInput`
 * recipe existed across the three placement lists; the `lazy` modifier is the
 * load-bearing one, since it commits on blur rather than firing a mutation per
 * keystroke, and it is exactly the kind of prop a fifth copy would omit.
 *
 * `?? ''` here is the sanctioned null-to-empty-string translation at an edit
 * boundary: the column is nullable, a text input's value is not.
 */
import AppInput from "@/components/common/AppInput.vue";

defineProps<{
  /** The stored note, or null when there is none yet. */
  modelValue: string | null;
  placeholder: string;
}>();

const emit = defineEmits<{ commit: [value: string] }>();
</script>
