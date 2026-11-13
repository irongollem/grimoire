<template>
  <!--
    The catalogue card of Dungeon Craft's features, traps and puzzles (#1179,
    frame 02 note 6): one EntityGridCard in both modes. With art on the type hangs
    on the plate; art-free it moves to the foot and the eyebrow names the kind.
    The three tabs differ only in these props, so the markup lives here once.
  -->
  <EntityGridCard
    :to="to"
    :title="name"
    :image-url="imageUrl"
    :focal-point="focalPoint"
    :placeholder="placeholder"
    :eyebrow="kind"
    :badge-text="type"
    :badge-class="typeClass"
  >
    <template #body="{ artFree }">
      <h3 v-if="!artFree" class="text-heading-xs font-bold text-foreground leading-tight truncate">{{ name }}</h3>
      <p v-if="subtitle" class="text-caption text-muted-foreground">{{ subtitle }}</p>
      <PlacedInLine v-if="rooms" :rooms="rooms" />
      <div v-if="!artFree" class="flex flex-wrap items-center gap-2">
        <span v-if="difficulty" class="flex items-center gap-1.5 text-label font-semibold text-foreground">
          <span class="size-2 shrink-0 rotate-45" :class="difficultyClass" aria-hidden="true" />
          {{ difficulty }}
        </span>
        <SourceBadge :source="source" class="max-w-22 truncate" />
      </div>
    </template>
    <template #foot>
      <span v-if="difficulty" class="flex items-center gap-1.5 text-label font-semibold text-foreground">
        <span class="size-2 shrink-0 rotate-45" :class="difficultyClass" aria-hidden="true" />
        {{ difficulty }}
      </span>
      <SourceBadge :source="source" class="max-w-22 truncate" />
    </template>
  </EntityGridCard>
</template>

<script setup lang="ts">
import EntityGridCard from "@/components/common/entity/EntityGridCard.vue";
import SourceBadge from "@/components/common/entity/SourceBadge.vue";
import type { PlacedInRoom } from "@/lib/dungeon-features/placedIn";
import PlacedInLine from "./PlacedInLine.vue";

const { imageUrl = null, focalPoint = null, subtitle = null, rooms = null, source, difficulty = null, difficultyClass } = defineProps<{
  to: string;
  name: string;
  /** The kind, for the art-free eyebrow: "Trap", "Puzzle". */
  kind: string;
  /** The type badge: on the plate with art, in the foot art-free. */
  type: string;
  typeClass: string;
  imageUrl?: string | null;
  focalPoint?: { x: number; y: number } | null;
  placeholder: string;
  subtitle?: string | null;
  /** Null draws no placement line (a library puzzle has none). */
  rooms?: PlacedInRoom[] | null;
  /** The library book's key; undefined for the DM's own row. */
  source?: string;
  /** A puzzle's difficulty; the other kinds have none. */
  difficulty?: string | null;
  difficultyClass?: string;
}>();
</script>
