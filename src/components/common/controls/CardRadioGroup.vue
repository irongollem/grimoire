<template>
  <!--
    A radio group of two-line cards: a title, a description and an optional note.
    The edition picker and the game system picker are both this, which is why it
    exists (the character wizard, New Campaign and the Rules tab choose between
    options that read the same way).

    Each option is an AppButton laid out as a two-line card: only the layout
    tokens are overridden (stack, left-align, wrap), the border, radius, hover
    and selected states are the primitive's. The description and note drop the
    button's label weight: three bold lines per card read as shouting. The
    cards share a row, so the shorter one is top-aligned rather than centred,
    or the two titles sit at different heights. With an odd number of options the
    last card takes the whole row rather than sitting half-width on its own. It is a
    radio group, so it says so: one tab stop, and the arrow keys move the choice.
  -->
  <div
    ref="groupRef"
    class="grid gap-2 sm:grid-cols-2"
    role="radiogroup"
    :aria-label="label"
    @keydown="onKeydown"
  >
    <AppButton
      v-for="(option, i) in options"
      :key="option.value"
      variant="subtle"
      size="body"
      block
      role="radio"
      :active="modelValue === option.value"
      :aria-checked="modelValue === option.value"
      :tabindex="tabStop === option.value ? 0 : -1"
      :disabled="disabled"
      class="flex-col items-start justify-start gap-1 whitespace-normal py-3 text-left"
      :class="{ 'sm:col-span-2': options.length % 2 === 1 && i === options.length - 1 }"
      @click="emit('update:modelValue', option.value)"
    >
      <span class="text-caption font-semibold text-foreground">{{ option.label }}</span>
      <span class="text-caption font-normal text-muted-foreground">{{ option.description }}</span>
      <span v-if="notes?.[option.value]" class="text-caption font-normal text-ink-caution">{{ notes[option.value] }}</span>
    </AppButton>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";

const { modelValue, options, disabled = false, label, notes } = defineProps<{
  /** Null while nothing is chosen yet. */
  modelValue: T | null;
  options: ReadonlyArray<{ value: T; label: string; description: string }>;
  disabled?: boolean;
  /** Names the group for assistive tech. */
  label: string;
  /** A line under one option that is specific to where the picker is shown, such as "Your table plays this." */
  notes?: Partial<Record<T, string>>;
}>();

const emit = defineEmits<{ "update:modelValue": [value: T] }>();

const groupRef = ref<HTMLElement | null>(null);

// With nothing chosen the first option holds the tab stop, or the group could
// not be reached by keyboard at all.
const tabStop = computed<T | undefined>(() => modelValue ?? options[0]?.value);

function onKeydown(event: KeyboardEvent) {
  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
    : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1
    : 0;
  if (step === 0 || disabled || options.length === 0) return;
  event.preventDefault();
  const current = options.findIndex((option) => option.value === tabStop.value);
  const next = (current + step + options.length) % options.length;
  emit("update:modelValue", options[next].value);
  groupRef.value?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
}
</script>
