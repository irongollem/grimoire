<template>
  <section
    :data-tour="tour"
    :class="
      cn(
        'flex flex-col rounded-lg border bg-card overflow-hidden',
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
      The cap lives here rather than on each widget, which is the whole point of
      the component: a party that has hoarded a dozen unknown wands, or a
      campaign with thirty rumors, must not decide how tall its neighbours are.
      Widgets that are genuinely their own size — a responsive party grid — pass
      `max-height="none"`.
    -->
    <div
      v-else
      :class="
        cn(
          'min-h-0 flex-1',
          MAX_HEIGHTS[maxHeight],
          maxHeight !== 'none' && 'overflow-y-auto overscroll-contain',
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
  lg: "max-h-[32rem]",
} as const;
</script>
