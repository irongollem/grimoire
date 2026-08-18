<template>
  <!--
    One checkable row inside a reveal control — a party member under "who", a
    field or switch under "what".

    Extracted because both halves of the control are the same row, and the
    moment they are written out twice they start to differ. That is not a
    hypothetical: `RevealBody` and `LocationRevealControl` had already grown
    their own copy of this markup, and NPC fields, monster stats and puzzle
    hints would have made five. Nineteen surfaces disagreeing about what
    "reveal" looks like is the bug this whole control exists to fix; it would be
    a poor showing to reintroduce it one level down.
  -->
  <AppButton
    variant="ghost"
    size="sm"
    block
    class="justify-start gap-2 rounded px-2 hover:bg-muted"
    :aria-pressed="checked"
    @click="emit('toggle')"
  >
    <span
      class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors"
      :class="checked ? 'border-primary bg-primary' : 'border-border'"
    >
      <IconCheck v-if="checked" class="h-2.5 w-2.5 text-primary-foreground" />
    </span>
    <span class="truncate text-left">{{ label }}</span>
  </AppButton>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import { IconCheck } from "@/lib/icons";

defineProps<{
  label: string;
  checked: boolean;
}>();

const emit = defineEmits<{ toggle: [] }>();
</script>
