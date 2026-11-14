<template>
  <!-- The one way a list is sorted (the maintainer, 14 Nov 2026: one visual
       language for sorting, everywhere). A sort is one object: the field as a
       dropdown and, when the order can run both ways, its direction beside it,
       drawn inside a single field frame so it reads as one thing. It wears the
       field hooks itself, so Vellum frames the pair as one slip on the bare page
       and one line on a card, and the select inside is bare.

       What it replaced: a sort glyph (⇕), the select's caret and a chevron side
       by side, three arrows meaning three things; and sorts built from segmented
       buttons, which looked exactly like the view toggles and filters beside them. -->
  <div
    data-field="sort"
    data-field-size="sm"
    data-field-tone="card"
    :class="cn(fieldVariants({ tone: 'card', size: 'sm' }), 'inline-flex shrink-0 items-center py-0 pr-0.5 pl-0 focus-within:ring-1 focus-within:ring-ring')"
  >
    <AppSelect v-model="sortBy" tone="bare" size="sm" aria-label="Sort by">
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </AppSelect>
    <template v-if="direction">
      <span class="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
      <AppButton
        variant="ghost"
        size="icon-sm"
        :icon="sortDir === 'asc' ? IconSortAsc : IconSortDesc"
        :tooltip="`${direction}. Click to reverse.`"
        @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
      />
    </template>
  </div>
</template>

<script setup lang="ts" generic="F extends string">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { fieldVariants } from "@/components/common/controls/fieldVariants";
import { directionLabel, type SortOption } from "@/lib/sortOptions";
import { IconSortAsc, IconSortDesc } from "@/lib/icons";
import type { SortDir } from "@/lib/noteSort";
import { cn } from "@/lib/utils";

const { options } = defineProps<{ options: readonly SortOption<F>[] }>();

const sortBy = defineModel<F>("sortBy", { required: true });
/** Leave unbound for a list whose fields never reverse (a provider's ranking). */
const sortDir = defineModel<SortDir>("sortDir");

// The direction shows only where the chosen field can run both ways and the list keeps a direction.
const direction = computed(() => {
  const option = options.find((o) => o.value === sortBy.value);
  return option && sortDir.value ? directionLabel(option, sortDir.value) : null;
});
</script>
