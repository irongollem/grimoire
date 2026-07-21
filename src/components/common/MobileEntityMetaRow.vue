<template>
  <!--
    Mobile-only (<md) meta row for entity list screens:
      left  = italic "N of M {plural}"
      right = 2-segment rows/gallery layout toggle (gold active segment)
    The layout choice is bound to the persisted ui-store pref.
  -->
  <div class="flex items-center justify-between gap-3 py-2">
    <p class="text-body italic text-muted-foreground">
      {{ shown }} of {{ total }} {{ plural }}
    </p>

    <div
      class="flex shrink-0 overflow-hidden rounded-md border border-border"
      role="radiogroup"
      aria-label="List layout"
    >
      <button
        type="button"
        role="radio"
        :aria-checked="layout === 'rows'"
        class="flex size-9 items-center justify-center transition-colors"
        :class="layout === 'rows' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'"
        aria-label="Rows layout"
        @click="layout = 'rows'"
      >
        <IconListView class="size-4" />
      </button>
      <button
        type="button"
        role="radio"
        :aria-checked="layout === 'gallery'"
        class="flex size-9 items-center justify-center border-l border-border transition-colors"
        :class="layout === 'gallery' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'"
        aria-label="Gallery layout"
        @click="layout = 'gallery'"
      >
        <IconGridView class="size-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconGridView, IconListView } from "@/lib/icons";

const layout = defineModel<"rows" | "gallery">("layout", { required: true });
defineProps<{
  shown: number;
  total: number;
  plural: string;
}>();
</script>
