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
    <!-- Frame 08's own caption — the one write this surface makes, spelled
         out so a DM never wonders whether a click did more than move a pin. -->
    <span v-if="mode === 'run'" class="italic text-caption-sm text-muted-foreground/80">
      Click a room to move the party — the only write this surface makes.
    </span>
    <!-- "3 traps · 4 features · 2 puzzles · 2 encounters · 1 loot cache"
         (#868, frame 10) — only when there's something to report; a caller
         that hasn't wired `preparedCounts` yet simply gets no caption. -->
    <span v-else-if="showPrepared && preparedCaption" class="italic text-caption-sm text-muted-foreground/80">
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
 * appends the Prepared layer's six kinds and `showRoomFacts` (#868, frame 01)
 * the four room-state tints — both genuinely conditional, since the legend
 * shouldn't teach a palette for a layer that's off or a fact nothing has
 * asserted yet.
 *
 * Run mode (frame 08) swaps the whole legend for its own three-entry
 * vocabulary and caption instead — a DM reading the run surface has no use
 * for "traced, unbound" or a puzzle's violet dot, and mixing the two
 * palettes on one legend would teach neither cleanly.
 */
import { computed } from "vue";
import { ROOM_FACT_COLORS } from "@/lib/locations/planCanvas";
import { MARK_COLOURS, PREPARED_MARK_KIND_LABELS, PREPARED_MARK_KINDS } from "@/lib/locations/preparedMarks";
import type { PreparedMarkKind } from "@/lib/locations/preparedMarks";

const { mode = "browse", showPrepared = false, showRoomFacts = false, preparedCounts } = defineProps<{
  /** Browse (default): the map's own editing/tracing vocabulary. Run
   *  (`SiteRunSurface`): party/reachable/locked instead. */
  mode?: "browse" | "run";
  /** Whether the Prepared layer is currently on — appends its six entries.
   *  Ignored in run mode. */
  showPrepared?: boolean;
  /** Whether any bound space on this site carries an explored/cleared/looted
   *  fact yet — appends the four room-state tints (#868, frame 01). Ignored
   *  in run mode. */
  showRoomFacts?: boolean;
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

/** The same four tints `planCanvas.ts` paints a bound space with — reused
 *  rather than re-picked, so the legend and the map can never drift apart. */
const ROOM_FACT_LEGEND_ITEMS: LegendItem[] = [
  { label: "Explored", color: ROOM_FACT_COLORS.exploredOnly, shape: "dot" },
  { label: "Cleared", color: ROOM_FACT_COLORS.cleared, shape: "dot" },
  { label: "Looted", color: ROOM_FACT_COLORS.looted, shape: "dot" },
  { label: "Cleared & looted", color: ROOM_FACT_COLORS.clearedAndLooted, shape: "dot" },
];

const RUN_LEGEND_ITEMS: LegendItem[] = [
  { label: "Party", color: "rgba(96, 165, 250, 0.85)", shape: "dot" },
  { label: "Reachable", color: "rgba(74, 222, 128, 0.85)", shape: "dot" },
  { label: "Behind a closed way", color: "rgba(120, 113, 108, 0.85)", shape: "dot" },
];

const legendItems = computed(() => {
  if (mode === "run") return RUN_LEGEND_ITEMS;
  const items = [...BASE_LEGEND_ITEMS];
  if (showRoomFacts) items.push(...ROOM_FACT_LEGEND_ITEMS);
  if (showPrepared) items.push(...PREPARED_LEGEND_ITEMS);
  return items;
});

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
