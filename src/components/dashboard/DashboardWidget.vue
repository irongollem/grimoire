<template>
  <section
    :data-tour="tour"
    :class="
      cn(
        'flex flex-col rounded-lg border bg-card overflow-hidden',
        MAX_HEIGHTS[maxHeight],
        TONES[tone].card,
      )
    "
  >
    <div
      v-if="title"
      :class="
        cn(
          'flex items-center justify-between gap-2 px-4 py-2.5 border-b',
          TONES[tone].header,
        )
      "
    >
      <h2
        :class="
          cn(
            'flex items-center gap-2 font-cinzel text-sm font-bold tracking-wide',
            TONES[tone].title,
          )
        "
      >
        {{ title }}
        <span
          v-if="count !== undefined && count !== null"
          :class="
            cn(
              'rounded border px-1.5 py-0.5 font-cinzel text-2xs',
              TONES[tone].count,
            )
          "
          >{{ count }}</span
        >
      </h2>
      <!-- Most widgets want one link out to their full view; anything richer
           passes its own controls. -->
      <slot name="action">
        <AppButton
          v-if="to"
          :to="to"
          variant="link"
          size="inline-xs"
          :label="actionLabel"
        />
      </slot>
    </div>

    <div v-if="loading" class="flex justify-center py-6">
      <LoadingSpinner />
    </div>

    <div v-else-if="empty" class="px-4 py-6 text-center">
      <slot name="empty">
        <p class="text-body text-muted-foreground italic">{{ emptyText }}</p>
      </slot>
    </div>

    <!--
      The cap is on the card, and the body simply fills whatever is left after
      the header. It was the other way round at first, and the two maxima did
      not agree: the grid stretches every card to the tallest in its row, while
      the body stopped at a fixed 24rem — so a full widget showed a row sliced
      in half and then a band of dead card beneath it. One height, set in one
      place, and the scroll region ends exactly where the card does.

      Widgets that are genuinely their own size — a responsive party grid — pass
      `max-height="none"` and never scroll.
    -->
    <div
      v-else
      :class="
        cn(
          'min-h-0 flex-1',
          maxHeight !== 'none' && 'widget-scroll overflow-y-auto overscroll-contain',
        )
      "
    >
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { cn } from "@/lib/utils";
import AppButton from "@/components/common/AppButton.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

/**
 * The one dashboard card.
 *
 * Six widgets had each written out `rounded-lg border border-border bg-card
 * overflow-hidden` plus a header row, and they had already drifted: one used an
 * amber border and an amber title, the rest did not; one capped its own height,
 * the rest grew until they pushed the page past the first screen. Structure and
 * limits belong here; what goes inside belongs to each widget.
 *
 * @see DashboardQuestsPanel for the fullest example — three sections, one card.
 */
const {
  title,
  count,
  to,
  actionLabel = "View all →",
  tone = "default",
  loading = false,
  empty = false,
  emptyText = "Nothing here yet.",
  maxHeight = "md",
  tour,
} = defineProps<{
  title?: string;
  /** Rendered as a chip beside the title. */
  count?: number | null;
  /** Destination for the default header link. */
  to?: string;
  actionLabel?: string;
  /** `caution` is for a widget that is asking for something to be done. */
  tone?: keyof typeof TONES;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  /** `none` for content that is its own size — a responsive grid, not a list. */
  maxHeight?: keyof typeof MAX_HEIGHTS;
  /** Product-tour anchor, where the widget has one. */
  tour?: string;
}>();

/** Semantic, matching AppButton's vocabulary rather than naming a hue. */
const TONES = {
  default: {
    card: "border-border",
    header: "border-border bg-muted/20",
    title: "text-foreground",
    count: "border-border bg-muted/40 text-muted-foreground",
  },
  caution: {
    card: "border-tone-caution/30",
    header: "border-tone-caution/20 bg-tone-caution/5",
    title: "text-tone-caution",
    count: "border-tone-caution/30 bg-tone-caution/15 text-tone-caution",
  },
} as const;

const MAX_HEIGHTS = {
  none: "",
  sm: "max-h-56",
  md: "max-h-76",
  lg: "max-h-76",
} as const;
</script>

<style scoped>
/*
  Scroll shadows, so a row cut by the scroll edge reads as "there is more"
  rather than as a rendering fault. The `local` layers are the card's own
  background scrolling with the content; the `scroll` layers are the shadows,
  fixed to the container — so each shadow is covered exactly when that end is
  reached, and appears when it is not. No JS, no scroll listener.
*/
.widget-scroll {
  /* Derived from the text colour, not a fixed black: on the dark theme a black
     shadow over a near-black card is invisible, and the edge would read as a
     clean cut again — which is the whole thing this exists to prevent. */
  --widget-scroll-shadow: color-mix(in srgb, var(--foreground) 16%, transparent);
  background:
    linear-gradient(var(--card) 30%, transparent) top    / 100% 1.25rem no-repeat local,
    linear-gradient(transparent, var(--card) 70%) bottom / 100% 1.25rem no-repeat local,
    radial-gradient(farthest-side at 50% 0,    var(--widget-scroll-shadow), transparent) top    / 100% 0.4rem no-repeat scroll,
    radial-gradient(farthest-side at 50% 100%, var(--widget-scroll-shadow), transparent) bottom / 100% 0.4rem no-repeat scroll;
}
</style>
