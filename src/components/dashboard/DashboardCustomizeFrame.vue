<!--
  Documentation lives in <script setup>, not here (same reason as AppButton):
  any comment at the template root becomes a sibling of the `template v-if` /
  `div v-else` pair below, which is one more root node than this component
  actually has and would leak an HTML comment into the "not customizing" output
  that the story requires to be byte-identical to the slot alone.
-->
<template>
  <template v-if="!customizing">
    <slot />
  </template>
  <div
    v-else
    :data-widget-key="entry.key"
    :class="['relative scroll-mt-4', $attrs.class]"
  >
    <div ref="slotHost" v-show="!slotIsEmpty" class="pointer-events-none h-full min-h-0">
      <slot />
    </div>

    <div
      v-if="slotIsEmpty"
      class="flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-center"
    >
      <p class="font-cinzel text-sm font-semibold text-muted-foreground">{{ widget.title }}</p>
      <p class="text-caption text-muted-foreground/80 italic">{{ widget.description }}</p>
      <p v-if="widget.selfHiding" class="text-caption text-muted-foreground/60 italic">
        Empty right now — it appears on its own once it has something to show.
      </p>
    </div>

    <div
      class="absolute right-1 top-1 z-20 flex items-center gap-0.5 rounded-md border border-border bg-card/95 px-1 py-0.5 shadow-md backdrop-blur-sm"
    >
      <AppButton
        variant="ghost"
        size="icon-xs"
        :icon="IconDrag"
        :class="['dashboard-customize-grip cursor-grab active:cursor-grabbing', ICON_TOUCH_TARGET]"
        aria-label="Drag to reorder"
        tooltip="Drag to reorder — arrow keys also move this widget"
        @keydown="onGripKeydown"
      />
      <!--
        Steppers, not one-way cycles. A single forward-only button makes going
        back the long way round — three widths is two presses to return, four
        heights is three — and overshooting by one is the commonest thing a DM
        does with a size control.
      -->
      <span v-if="widget.widths.length > 1" class="flex items-center">
        <AppButton
          variant="ghost"
          size="icon-xs"
          :icon="IconChevronLeft"
          :aria-label="`Narrower — currently ${widthLabel}`"
          tooltip="Narrower"
          @click="emit('cycle-width', entry.key, -1)"
        />
        <span class="px-0.5 font-cinzel text-2xs text-muted-foreground">{{ widthLabel }}</span>
        <AppButton
          variant="ghost"
          size="icon-xs"
          :icon="IconChevronRight"
          :aria-label="`Wider — currently ${widthLabel}`"
          tooltip="Wider"
          @click="emit('cycle-width', entry.key, 1)"
        />
      </span>

      <span v-if="offeredHeights.length > 1" class="flex items-center">
        <AppButton
          variant="ghost"
          size="icon-xs"
          :icon="IconChevronDown"
          :aria-label="`Shorter — currently ${heightLabel} of 4`"
          tooltip="Shorter"
          @click="emit('cycle-height', entry.key, -1)"
        />
        <span class="px-0.5 font-cinzel text-2xs text-muted-foreground">{{ heightLabel }}</span>
        <AppButton
          variant="ghost"
          size="icon-xs"
          :icon="IconChevronUp"
          :aria-label="`Taller — currently ${heightLabel} of 4`"
          tooltip="Taller"
          @click="emit('cycle-height', entry.key, 1)"
        />
      </span>
      <!-- Only for widgets that carry per-instance settings (#764). Sits
           before Remove so the destructive control stays last in the pill. -->
      <AppButton
        v-if="widget.configurable"
        variant="ghost"
        size="icon-xs"
        :icon="IconSettings"
        :aria-label="`Configure ${widget.title}`"
        tooltip="Choose what this card shows"
        @click="emit('configure', entry.key)"
      />
      <AppButton
        variant="ghost"
        size="icon-xs"
        :icon="IconClose"
        aria-label="Remove from dashboard"
        tooltip="Move to the shelf — nothing is deleted"
        @click="emit('remove', entry.key)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The per-widget overlay Customize mode (#763) puts around every widget on the
 * dashboard. It owns no layout arithmetic at all — `move`, `cycle-width`,
 * `remove` and `configure` are emitted as intent, and `src/lib/dashboard/arrangeOps.ts`
 * (already finished, already tested) is what turns them into a new layout.
 * That split is what lets the pointer-drag path (owned by the drag
 * container, a separate story) and this keyboard path agree on every edit:
 * neither one computes a position, they both just say what happened.
 *
 * The widget itself is rendered untouched — no border, no strip, no reskin.
 * Customize mode adds controls and nothing else, because judging a layout means
 * seeing the board you actually have; a frame drawn around every card makes
 * customizing look like a different page from the one being arranged.
 *
 * **The pill overlays the card's top-right corner, and that is a reversal.**
 * #763 floated it in the row gap *above* each widget, because an overlay
 * covers real content — `DashboardWidget` puts its own "View all →" link in
 * exactly that corner. But paying for that gap meant the grid had to open its
 * row spacing while customizing, and once #768 gave widgets fixed row heights
 * a wider gap stopped being whitespace and started changing the cards
 * themselves: every spanned widget grew, and every column started somewhere
 * else. You were arranging a board that was not the board you got.
 *
 * Covering a "View all →" link for as long as the mode is open is the smaller
 * cost by a wide margin — you are arranging the board, not navigating off it —
 * and it buys exact geometric parity between the two modes, with no gap or top
 * padding to pay for at all.
 *
 * **The widget is also made inert while the mode is open** (`pointer-events-none`
 * on the slot host, which the pill is a sibling of, so the controls keep
 * theirs). It is rendered at full fidelity — you still judge the real board,
 * which is the governing rule — you simply cannot click *into* it. That fixes
 * a real trap as well as freeing the overlay: a stray click on a widget's own
 * link used to navigate off the dashboard in the middle of arranging it.
 *
 * `h-full min-h-0` on that host is load-bearing and easy to lose. Outside this
 * mode the widget *is* the grid item, so `DashboardWidget`'s own `h-full`
 * resolves against the row span #768 gave it. In here it sits one div deeper,
 * and a host with no height of its own makes `h-full` mean "as tall as the
 * content" — so every card grew straight out of its allotted rows, in the one
 * mode whose entire job is showing what the board will look like.
 *
 * `data-widget-key` on the customizing root is how `DashboardView` finds this
 * instance in the DOM to scroll it back into view after an edit — a widget
 * added from the shelf lands at the end of a board that may be well below the
 * fold, and without that the click looks like it did nothing. `scroll-mt-4` is
 * only breathing room now that the pill lives inside the card; while it
 * floated above, that margin had to clear the pill or a widget scrolled flush
 * to the top took its own controls off screen.
 *
 * Both are set in the template rather than explained there, because a comment
 * at the template root becomes a sibling of the `template v-if` / `div v-else`
 * pair — see the note at the top of this file. Adding one broke
 * `wrapper.classes()` in this component's own test on the first attempt.
 *
 * `$attrs.class` is forwarded onto the customizing root by hand, because
 * `inheritAttrs` is off below. Without it the view's WIDTH_CLASSES never reach
 * the grid item while customizing: every widget rendered one column wide
 * whatever its real width, and the width control announced a change that
 * nothing on screen made. A full-width Party widget looking identical to a
 * single cell is what makes that misleading rather than merely wrong.
 *
 * Two widgets (DashboardStats, LiveEncounterBanner) render with no card
 * shell at all, which is exactly why this is a wrapping overlay rather than
 * something `DashboardWidget` grows — it has to work identically whether the
 * thing underneath is a bordered card or a bare strip of links.
 */
import { computed, onMounted, onUpdated, ref, useTemplateRef } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { ICON_TOUCH_TARGET } from "@/components/common/appButtonVariants";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconClose,
  IconDrag,
  IconSettings,
} from "@/lib/icons";
import type { DashboardLayoutEntry } from "@/lib/dashboard/defaultLayouts";
import { defaultHeightFor, heightsFor, type DashboardWidgetDef } from "@/lib/dashboard/widgetCatalog";

const { entry, widget, customizing = false } = defineProps<{
  /** The layout row this frame wraps — carries the instance `key` every emit reports. */
  entry: DashboardLayoutEntry;
  /** The catalogue definition for `entry.id` — titles the placeholder, gates the width control. */
  widget: DashboardWidgetDef;
  /** Whether Customize mode is active. False renders only the slot — see the template. */
  customizing?: boolean;
}>();

// Never forwarded anywhere: the non-customizing branch has no single root for
// Vue to inherit attrs onto (it is whatever the slot itself renders), so
// leaving inheritance on would make the *customizing* branch's wrapper div the
// only one that ever receives a stray attribute — a difference in behaviour
// between the two states that nothing here should depend on.
defineOptions({ inheritAttrs: false });

const emit = defineEmits<{
  /** One position toward the start (-1) or end (1) of the layout. */
  move: [key: string, direction: -1 | 1];
  /** Step through `widget.widths`, wrapping in either direction. */
  "cycle-width": [key: string, direction: 1 | -1];
  /** Step through the widget's offered heights, wrapping either way (#768). */
  "cycle-height": [key: string, direction: 1 | -1];
  /** Off the dashboard and onto the shelf — never a delete. */
  remove: [key: string];
  /** Open this instance's settings dialog. Only ever emitted for a
   *  `configurable` widget, since nothing else renders the control. */
  configure: [key: string];
}>();

const slotHost = useTemplateRef<HTMLElement>("slotHost");
const slotIsEmpty = ref(false);

/**
 * Whether the widget in the slot actually painted anything.
 *
 * Measured from the DOM rather than read off the slot's vnodes, and that
 * distinction is the whole bug this replaced. A self-hiding widget is a
 * *component* — `<PinnedNotesWidget />` — whose own root is `v-if`-ed away.
 * The comment node that leaves behind lives inside that component's render,
 * so from here the slot vnode is a perfectly ordinary component vnode and
 * looks non-empty. Inspecting vnodes only works when the `v-if` sits directly
 * on the slot's root, which is how a test can be written but never how this
 * component is used.
 *
 * `childElementCount` is the honest question: a comment is not an element, so
 * a widget that rendered nothing has none. The text check catches the rarer
 * widget that renders bare text instead of using `v-if`.
 */
function measureSlot(): void {
  const host = slotHost.value;
  if (host === null) return;
  const text = host.textContent;
  slotIsEmpty.value = host.childElementCount === 0 && (text === null || text.trim() === "");
}

// `onUpdated` as well as `onMounted`: a widget's own query resolving is what
// turns an empty PinnedNotesWidget into a populated one, and that lands as a
// re-render long after this frame mounted. Re-measuring is a property read,
// and setting the ref to a value it already holds does not re-trigger.
onMounted(measureSlot);
onUpdated(measureSlot);

const widthLabel = computed(() => entry.width.charAt(0).toUpperCase() + entry.width.slice(1));

const offeredHeights = computed(() => heightsFor(widget));

/**
 * Shown as a bare number rather than a word, because unlike widths there is no
 * vocabulary for these — "Cell/Wide/Full" name shapes a DM can picture, while
 * heights are a count of half-cards and "2" says that better than "Medium".
 * The aria-label supplies the "of 4" that the pill has no room for.
 */
const heightLabel = computed(() =>
  String(entry.height === undefined ? defaultHeightFor(widget) : entry.height),
);

function onGripKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case "ArrowUp":
    case "ArrowLeft":
      event.preventDefault();
      emit("move", entry.key, -1);
      return;
    case "ArrowDown":
    case "ArrowRight":
      event.preventDefault();
      emit("move", entry.key, 1);
      return;
    case "Delete":
    case "Backspace":
      event.preventDefault();
      emit("remove", entry.key);
      return;
    default:
      return;
  }
}
</script>
