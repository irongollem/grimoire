<template>
  <span class="inline-flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
    <span aria-hidden="true" :class="['h-2 w-2 rotate-45', DIAMOND[kind]]" />
    {{ label ?? learnedKindLabel(kind) }}
  </span>
</template>

<script setup lang="ts">
import { learnedKindLabel, type LearnedKind } from "@/lib/sessions/learned";

/** A kind's small coloured diamond and its caps label, shared by the session page and the unsorted list. */
const { kind, label } = defineProps<{
  kind: LearnedKind;
  /** Overrides the kind's own heading (the unsorted list says "Person", not "People met"). */
  label?: string;
}>();

const DIAMOND: Record<LearnedKind, string> = {
  person: "bg-primary",
  place: "bg-emerald-600",
  handout: "bg-amber-600",
  creature: "bg-destructive",
  quest: "bg-sky-600",
  combat: "bg-muted-foreground",
};
</script>
