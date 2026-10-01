<template>
  <div
    ref="slot"
    :data-tour="tour"
    :data-unrolled="expanded ? '' : undefined"
    :class="cn('relative h-full min-h-0', (expanded || settling) && 'z-20')"
  >
    <!--
      Two boxes, and the split is the whole mechanism. This outer one is the grid
      item: it takes the width and row span the layout hands it and never changes
      size. The card inside fills it, until the DM unrolls it. Then, from `lg`, it
      lifts out of the flow and grows downward over its neighbours, so nothing
      else on the board moves. Below `lg` there is one column and no tessellation
      to protect, so the card simply grows in place and pushes the rest down.
    -->
    <section
      ref="card"
      :class="
        cn(
          'flex flex-col rounded-lg border bg-card overflow-hidden',
          TONES[tone].card,
          expanded
            ? 'h-full lg:absolute lg:inset-x-0 lg:top-0 lg:h-auto lg:min-h-full border-primary/50 shadow-2xl'
            : ['h-full min-h-0', MAX_HEIGHTS[maxHeight]],
        )
      "
      @keydown.esc="onEscape"
    >
      <div
        v-if="title"
        :class="
          cn(
            'flex shrink-0 items-center justify-between gap-2 px-4 py-2.5 border-b',
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

      <template v-else>
        <!--
          The body is cut, never scrolled. `clip` and not `hidden`: a hidden box
          is still a scroll container, so tabbing to a link below the cut would
          scroll the body under the DM with no scrollbar to bring it back. A
          clipped box cannot move at all, and `onFocusIn` unrolls the card
          instead, which is the same answer a click on the footer gives.
        -->
        <div
          :id="bodyId"
          ref="body"
          :class="cn('flex-1', !expanded && 'min-h-0 overflow-y-clip')"
          @focusin="onFocusIn"
          @click="onUse"
          @input="onUse"
          @keydown="onUse"
        >
          <slot />
        </div>

        <!--
          Only when there is something below the cut. The fade sits over the
          last line of the body so a row sliced in half reads as "this
          continues" and the strip under it says how to see the rest.
        -->
        <div
          v-if="overflowing || expanded"
          ref="footer"
          :class="cn('relative shrink-0 border-t', TONES[tone].header)"
        >
          <div
            v-if="!expanded"
            class="pointer-events-none absolute inset-x-0 bottom-full h-6 bg-linear-to-t from-card to-transparent"
            aria-hidden="true"
          />
          <AppButton
            ref="toggle"
            variant="ghost"
            size="xs"
            block
            class="rounded-none py-1.5 font-cinzel tracking-wide"
            :label="expanded ? 'Show less' : 'Show more'"
            :icon-right="expanded ? IconChevronUp : IconChevronDown"
            :aria-expanded="expanded"
            :aria-controls="bodyId"
            @click="setExpanded(!expanded)"
          />
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  type ComponentPublicInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  useId,
  useTemplateRef,
  watch,
} from "vue";
import { onClickOutside } from "@vueuse/core";
import { cn } from "@/lib/utils";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
import { playBlockResize, revealInScrollParent } from "@/lib/motion";
import { useAbove } from "@/composables/useBreakpoint";
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
 * **The dashboard has one scrollbar, and it is the page's.** A card used to
 * scroll its own body inside whatever height the grid gave it (#768), which put
 * a dozen small scroll regions inside a page that also scrolls: the wheel moved
 * whichever one the pointer happened to be over, `overscroll-contain` then held
 * it there at the end of the list, and on a phone a thumb landing on a card
 * dragged the card instead of the page. Nothing on screen said which was which.
 *
 * So a card never scrolls. It shows what fits, and when there is more it says
 * so with a footer: "Show more" unrolls the card to its full length, over the
 * board from `lg` and in place below it, and "Show less", Escape or a click
 * anywhere else rolls it back. The grid's fixed rows are untouched either way,
 * which is what #768 was protecting. In Customize mode the footer cannot be
 * pressed (the frame makes the widget inert) and so reads as what it also is:
 * a sign that this card is too short for what it holds.
 *
 * @see DashboardQuestsPanel for the fullest example: three sections, one card.
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
  /** `none` for content that is its own size below `lg`: a responsive grid,
   *  not a list. `md` (the default) cuts everything else at a fixed height
   *  there. From `lg` the grid's row span decides, whatever this says. */
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

/**
 * Since #768 the grid gives every card a height, so this is a *ceiling on top
 * of that*, not the card's size, and only while the card is rolled up. `md`
 * still cuts a card below `lg`, where row spans do not apply and the grid is
 * one column; `none` is for content that is genuinely its own size there: a
 * responsive party grid, an avatar strip.
 */
const MAX_HEIGHTS = {
  none: "",
  md: "lg:max-h-none max-h-76",
} as const;

const slotEl = useTemplateRef<HTMLElement>("slot");
const cardEl = useTemplateRef<HTMLElement>("card");
const bodyEl = useTemplateRef<HTMLElement>("body");
const footerEl = useTemplateRef<HTMLElement>("footer");
const toggleEl = useTemplateRef<ComponentPublicInstance>("toggle");
const bodyId = useId();

/** Whether the rolled-up card is hiding part of its body. */
const overflowing = ref(false);
const expanded = ref(false);
/** A resize is in flight. Keeps the card above its neighbours until it lands,
 *  and keeps `measure` from reading a height that is only passing through. */
const settling = ref(false);
/** Whether an unrolled card lies *over* the board (from `lg`) rather than
 *  growing in the flow of a single column. */
const overlays = useAbove("lg");

/**
 * When the DM last pressed, typed or clicked inside the body, and how tall its
 * content was the last time anyone looked. Together they answer "did this card
 * just grow because it was used", which is the one case where waiting to be
 * asked is wrong; see `measure`.
 */
let lastUse = Number.NEGATIVE_INFINITY;
let contentHeight = 0;

/** Long enough for a debounced search to answer, short enough that data
 *  arriving on its own a moment after an unrelated click does not count. */
const USE_WINDOW_MS = 1200;

function onUse(): void {
  lastUse = performance.now();
}

/**
 * Whether the body holds more than the rolled-up card shows, and the two
 * things that follow from the answer without the DM pressing anything.
 *
 * **A card that grows because it was used unrolls by itself.** A dice roll
 * prints its result under the buttons, a condition opens its rules under its
 * row, a search fills in under its box. Cut off, the answer to the thing the
 * DM just did would be the part they cannot see, with a "Show more" standing
 * between them and it. Growth nobody caused (a query landing, a row synced in
 * from another client) never opens a card: a board that rearranges itself
 * while it is being read is worse than a footer.
 *
 * **An unrolled card with nothing left to show rolls back up.** From `lg` it is
 * lying over its neighbours with the board dimmed behind it, and once the
 * search is cleared or the drawer shut that is a cost paid for nothing.
 *
 * The footer takes its own height out of the body the moment it appears, so
 * that height is handed back before comparing. Without it a card whose content
 * fits exactly would keep a "Show more" that reveals one line of nothing,
 * because it only stopped fitting once the footer arrived.
 */
function measure(): void {
  const body = bodyEl.value;
  if (body === null) {
    overflowing.value = false;
    contentHeight = 0;
    return;
  }
  const grew = body.scrollHeight > contentHeight + 1;
  contentHeight = body.scrollHeight;
  // A height that is only passing through says nothing about either question.
  if (settling.value) return;

  if (expanded.value) {
    const card = cardEl.value;
    const slot = slotEl.value;
    if (overlays.value && card !== null && slot !== null && card.offsetHeight <= slot.offsetHeight + 1) {
      void setExpanded(false);
    }
    return;
  }

  const footer = footerEl.value;
  const room = body.clientHeight + (footer === null ? 0 : footer.offsetHeight);
  overflowing.value = body.scrollHeight > room + 1;
  if (overflowing.value && grew && performance.now() - lastUse < USE_WINDOW_MS) {
    void setExpanded(true);
  }
}

/**
 * Re-measured when the body or anything directly in it changes size: a query
 * landing, a search narrowing, a portrait finishing loading, the DM giving the
 * card another half-row. `onUpdated` re-syncs the observed set because the
 * slot's children are replaced, not resized, when a widget's data arrives.
 * Absent in the test DOM, where `onMounted`/`onUpdated` measure directly.
 */
let observer: ResizeObserver | null = null;

function observeBody(): void {
  measure();
  if (typeof ResizeObserver === "undefined") return;
  observer ??= new ResizeObserver(measure);
  observer.disconnect();
  const body = bodyEl.value;
  if (body === null) return;
  observer.observe(body);
  for (const child of body.children) observer.observe(child);
}

onMounted(observeBody);
onUpdated(observeBody);
onBeforeUnmount(() => observer?.disconnect());

async function setExpanded(next: boolean): Promise<void> {
  const card = cardEl.value;
  if (card === null || expanded.value === next) return;
  const from = card.getBoundingClientRect().height;
  expanded.value = next;
  settling.value = true;
  await nextTick();
  playBlockResize(card, from, () => {
    settling.value = false;
    // A long card rolled up from its far end leaves the page scrolled past
    // where the card now stops. Does nothing when the card is still in view.
    if (!next && slotEl.value !== null) revealInScrollParent(slotEl.value);
  });
}

// A card with no body has nothing to unroll. Left set, the next time content
// arrived the card would open over the board without anyone having asked.
watch(
  () => loading || empty,
  (bodiless) => {
    if (bodiless) expanded.value = false;
  },
);

/**
 * From `lg` an unrolled card lies over its neighbours, so a click on anything
 * else means the DM has moved on and the card gets out of the way. Below `lg`
 * it is in the flow and covers nothing; rolling it up there on a stray tap
 * would pull the page out from under the thumb.
 */
onClickOutside(cardEl, () => {
  if (expanded.value && overlays.value) void setExpanded(false);
});

function onEscape(event: KeyboardEvent): void {
  if (!expanded.value) return;
  event.stopPropagation();
  void setExpanded(false);
  // Focus may be on a row that is about to be cut off. The footer is the one
  // control guaranteed to still be showing, and it is what reopens the card.
  const toggle: unknown = toggleEl.value?.$el;
  if (toggle instanceof HTMLElement) toggle.focus();
}

/**
 * Keyboard focus landing below the cut unrolls the card, because the
 * alternative is a focus ring the DM cannot see. Only for focus the browser
 * would draw a ring for: a mouse press on a half-visible row must not spring
 * the card open under the pointer.
 */
function onFocusIn(event: FocusEvent): void {
  if (expanded.value || !overflowing.value) return;
  const body = bodyEl.value;
  const target = event.target;
  if (body === null || !(target instanceof HTMLElement)) return;
  if (!target.matches(":focus-visible")) return;
  if (target.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom) {
    void setExpanded(true);
  }
}
</script>
