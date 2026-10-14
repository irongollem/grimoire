<template>
  <span
    v-if="label"
    :title="label"
    class="rounded border border-border bg-muted px-1 py-0.5 text-label font-bold text-muted-foreground"
  >{{ label }}</span>
</template>

<script setup lang="ts">
/**
 * The book a row comes from, on a card or a row: a library book by its title
 * ("Tome of Beasts", "Grimoire Dungeon Craft"), or the source a DM typed on
 * their own row. Renders nothing when the row names no source.
 *
 * It sits in a card's text, on the title row beside the name, never over the
 * artwork: the picture's corners belong to the picture (its AI label) and to
 * what the entity is (a CR, a puzzle type). Truncation is a class at the call
 * site (`max-w-22 truncate`); the full title is the tooltip.
 */
import { computed } from "vue";
import { useSourceTitles } from "@/composables/library/useSourceTitles";

const { source, title } = defineProps<{
  /** The row's `source`: a `content_sources` key or a DM's free text. */
  source: string | null | undefined;
  /** A title the row carries (`source_title`), used when the key is not a known book. */
  title?: string | null;
}>();

const { labelFor } = useSourceTitles();
const label = computed(() => labelFor(source, title));
</script>
