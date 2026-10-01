<template>
  <!--
    The one place an edition is chosen: the character wizard's first step, New
    Campaign, and a campaign's Rules tab (#943). It was RulesTab's own markup
    until a second and third surface needed the same choice.

    Each option is an AppButton laid out as a two-line card: only the layout
    tokens are overridden (stack, left-align, wrap), the border, radius, hover
    and selected states are the primitive's. It is a radio group, so it says so:
    one tab stop, and the arrow keys move the choice.
  -->
  <div
    ref="groupRef"
    class="grid gap-2 sm:grid-cols-2"
    role="radiogroup"
    :aria-label="label"
    @keydown="onKeydown"
  >
    <AppButton
      v-for="option in RULESET_OPTIONS"
      :key="option.value"
      variant="subtle"
      size="body"
      block
      role="radio"
      :active="modelValue === option.value"
      :aria-checked="modelValue === option.value"
      :tabindex="tabStop === option.value ? 0 : -1"
      :disabled="disabled"
      class="flex-col items-start gap-1 whitespace-normal py-3 text-left"
      @click="emit('update:modelValue', option.value)"
    >
      <span class="font-cinzel text-xs font-semibold text-foreground">{{ option.label }}</span>
      <span class="text-caption text-muted-foreground">{{ option.description }}</span>
      <span v-if="notes?.[option.value]" class="text-caption text-ink-caution">{{ notes[option.value] }}</span>
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { RULESET_OPTIONS, type RulesetKey } from "@/types/ruleset.types";

const { modelValue, disabled = false, label = "Rules edition", notes } = defineProps<{
  /** Null while nothing is chosen yet: a new character has no edition until its player picks one. */
  modelValue: RulesetKey | null;
  disabled?: boolean;
  /** Names the group for assistive tech. */
  label?: string;
  /** A line under one option that is specific to where the picker is shown, such as "Your table plays this." */
  notes?: Partial<Record<RulesetKey, string>>;
}>();

const emit = defineEmits<{ "update:modelValue": [value: RulesetKey] }>();

const groupRef = ref<HTMLElement | null>(null);

// With nothing chosen the first option holds the tab stop, or the group could
// not be reached by keyboard at all.
const tabStop = computed<RulesetKey>(() => modelValue ?? RULESET_OPTIONS[0].value);

function onKeydown(event: KeyboardEvent) {
  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
    : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1
    : 0;
  if (step === 0 || disabled) return;
  event.preventDefault();
  const current = RULESET_OPTIONS.findIndex((option) => option.value === tabStop.value);
  const next = (current + step + RULESET_OPTIONS.length) % RULESET_OPTIONS.length;
  emit("update:modelValue", RULESET_OPTIONS[next].value);
  groupRef.value?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
}
</script>
