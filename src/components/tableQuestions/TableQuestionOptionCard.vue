<template>
  <!-- The raw button carries no chrome of its own: the whole card is the tap
       target and the visual card is the div inside it. -->
  <button
    type="button"
    class="block w-full cursor-pointer rounded-lg text-left outline-offset-4 disabled:cursor-default"
    :class="selected || outcome ? 'outline-3 outline-primary' : ''"
    :disabled="!selectable"
    :aria-pressed="selectable ? selected : undefined"
    @click="emit('pick')"
  >
    <div
      class="flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-shadow"
      :class="[
        selected || outcome ? 'border-primary ring-2 ring-primary' : 'border-border',
        takenBy ? 'opacity-60' : '',
        selectable && !selected ? 'hover:border-primary/60' : '',
      ]"
    >
      <div class="relative aspect-square w-full bg-muted">
        <!-- Vellum draws a card surface as torn paper, which replaces its border
             and ring, so the choice is marked on the picture and by the button's
             outline, never by the card's own border alone. -->
        <span
          v-if="selected || outcome"
          class="absolute top-2 right-2 z-10 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-md"
          aria-hidden="true"
        >
          <IconCheck class="size-5" />
        </span>
        <FocalImage v-if="option.image_url" :src="option.image_url" :alt="option.label" format="square" :focal-point="option.focal" />
        <div v-else class="grid h-full w-full place-items-center p-3 text-center">
          <span class="font-cinzel text-heading-sm leading-tight text-foreground">{{ option.label }}</span>
        </div>
      </div>
      <div class="flex flex-1 flex-col gap-1 p-3">
        <p v-if="option.image_url" class="font-cinzel text-body-lg leading-tight text-foreground">{{ option.label }}</p>
        <p v-if="option.blurb" class="text-body text-muted-foreground">{{ option.blurb }}</p>
        <p v-if="takenBy" class="text-label-lg font-semibold text-muted-foreground">Taken by {{ takenBy }}</p>
        <p v-else-if="outcome" class="text-label-lg font-semibold text-primary">The table goes with {{ option.label }}</p>
        <p v-else-if="selected" class="text-label-lg font-semibold text-primary">{{ yourLabel }}</p>
        <p v-if="others.length > 0" class="text-caption text-muted-foreground">{{ othersLine }}</p>
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { IconCheck } from "@/lib/icons";
import type { TableQuestionOption } from "@/types/tableQuestion.types";

/**
 * One option of a table question: a large picture, its name, its read-aloud
 * blurb. `others` is who else chose it (empty for a child, a secret vote or a
 * roll): the parent decides what may be shown, the card just renders it.
 */
const { option, selected = false, outcome = false, takenBy = null, disabled = false, others = [], yourLabel = "Your choice" } = defineProps<{
  option: TableQuestionOption;
  selected?: boolean;
  /** A closed vote's result. */
  outcome?: boolean;
  /** For an exclusive pick: the character who holds this one. */
  takenBy?: string | null;
  disabled?: boolean;
  others?: readonly string[];
  yourLabel?: string;
}>();
const emit = defineEmits<{ pick: [] }>();

const selectable = computed(() => !disabled && !takenBy);
const othersLine = computed(() => others.join(", "));
</script>
