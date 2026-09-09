<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
    <span v-for="item in legendItems" :key="item.label" class="flex items-center gap-1.5">
      <span
        class="shrink-0"
        :class="item.shape === 'bar' ? 'h-1 w-3 rounded-sm' : 'h-2.5 w-2.5 rounded-full'"
        :style="{ backgroundColor: item.color }"
        aria-hidden="true"
      />
      {{ item.label }}
    </span>
    <!-- "3 traps · 4 features · 2 puzzles · 2 encounters · 1 loot cache"
         (#868, frame 10) — only when there's something to report; a caller
         that hasn't wired `preparedCounts` yet simply gets no caption. -->
    <span v-if="showPrepared && preparedCaption" class="italic text-caption-sm text-muted-foreground/80">
      {{ preparedCaption }}
    </span>
  </div>
</template>

<script setup lang="ts">
/**
 * The reading key under a site's map (#868, frame 03) — what a dot's colour
 * and a bar's colour mean, so a DM doesn't have to learn the palette by
 * clicking every region once. The base five name every state the map's
 * spaces/ways-out overlays can be in, not any one site's current content, so
 * there is nothing to compute from props for those. `showPrepared` (#868, S8)
 * appends the Prepared layer's six kinds — those genuinely are conditional,
 * since the legend shouldn't teach a palette for a layer that's off.
 */
import { computed } from "vue";
import { MARK_COLOURS, PREPARED_MARK_KIND_LABELS, PREPARED_MARK_KINDS } from "@/lib/locations/preparedMarks";
import type { PreparedMarkKind } from "@/lib/locations/preparedMarks";

const { showPrepared = false, preparedCounts } = defineProps<{
  /** Whether the Prepared layer is currently on — appends its six entries. */
  showPrepared?: boolean;
  /** Per-kind tallies from `useSiteStructure`/`useSitePrepared` — feeds the
   *  frame-10 caption. Optional: a caller that hasn't wired this yet just
   *  gets the plain legend, not a broken one. */
  preparedCounts?: Record<PreparedMarkKind, number>;
}>();

interface LegendItem {
  label: string;
  color: string;
  shape: "dot" | "bar";
}

const BASE_LEGEND_ITEMS: LegendItem[] = [
  { label: "Bound to a room", color: "rgba(74, 222, 128, 0.85)", shape: "dot" },
  { label: "Traced, unbound", color: "rgba(251, 191, 36, 0.85)", shape: "dot" },
  { label: "Selected", color: "rgba(96, 165, 250, 0.85)", shape: "dot" },
  { label: "Locked way out", color: "rgba(251, 191, 36, 0.85)", shape: "bar" },
  { label: "Secret", color: "rgba(167, 139, 250, 0.85)", shape: "bar" },
];

const PREPARED_LEGEND_ITEMS: LegendItem[] = PREPARED_MARK_KINDS.map((kind) => ({
  label: PREPARED_MARK_KIND_LABELS[kind],
  color: MARK_COLOURS[kind],
  shape: "dot",
}));

const legendItems = computed(() => (showPrepared ? [...BASE_LEGEND_ITEMS, ...PREPARED_LEGEND_ITEMS] : BASE_LEGEND_ITEMS));

/** The caption's five nouns, singular/plural — "feature" folds in
 *  `secret_feature` too, since frame 10's caption doesn't distinguish them
 *  (the dots above already do, in violet). */
const CAPTION_LABELS: Record<"trap" | "feature" | "puzzle" | "encounter" | "loot", [string, string]> = {
  trap: ["trap", "traps"],
  feature: ["feature", "features"],
  puzzle: ["puzzle", "puzzles"],
  encounter: ["encounter", "encounters"],
  loot: ["loot cache", "loot caches"],
};

const preparedCaption = computed<string | null>(() => {
  const counts = preparedCounts;
  if (!counts) return null;
  const merged: Record<keyof typeof CAPTION_LABELS, number> = {
    trap: counts.trap,
    feature: counts.feature + counts.secret_feature,
    puzzle: counts.puzzle,
    encounter: counts.encounter,
    loot: counts.loot,
  };
  const parts = (Object.keys(CAPTION_LABELS) as Array<keyof typeof CAPTION_LABELS>)
    .filter((kind) => merged[kind] > 0)
    .map((kind) => {
      const [singular, plural] = CAPTION_LABELS[kind];
      const n = merged[kind];
      return `${n} ${n === 1 ? singular : plural}`;
    });
  return parts.length > 0 ? parts.join(" · ") : null;
});
</script>
