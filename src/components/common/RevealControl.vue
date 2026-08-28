<template>
  <!--
    The single reveal control (#750).

    Before this there were four: `PlayerVisibilityToggle`, two separate mobile
    bottom sheets, `RevealedFieldsPanel`, and eight ad-hoc popovers written into
    individual list and sheet views. NPCs alone used four of them, monsters had
    one only on mobile, and two surfaces had none at all — so "share this with
    my players" looked and behaved differently depending on where you happened
    to be standing.

    One button, one body, two presentations: a popover on pointer-and-space,
    a bottom sheet where a popover would be cramped. The body is identical, so
    the thing a DM learns once holds everywhere.
  -->
  <!--
    `flex`, not just `relative`: AppButton renders `inline-flex`, and an
    inline-level child sits on a text baseline, so a plain block wrapper is a
    few px taller than the button and leaves a descender gap underneath. That
    is invisible on its own and obvious the moment this sits in a row next to a
    button someone else placed — the Edit chip on a card is a direct flex child
    with no such gap, so the pair looked misaligned by a hair.
    The popover is teleported out of here, so it is unaffected either way.
  -->
  <div ref="containerRef" class="relative flex w-fit">
    <AppButton
      v-bind="buttonProps"
      :icon="state === 'private' ? IconHide : IconReveal"
      :title="title"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="toggleOpen"
    />

    <!--
      Pointer presentation, teleported to `body` and positioned against the
      trigger's viewport rect.

      It cannot be an absolutely-positioned child: this control's whole point is
      that it appears on list cards, and a card clips its children — the grid
      card carries `overflow-hidden` for its rounded corners and the hover zoom
      on the artwork. A popover inside it gets sliced off at the card edge. Every
      hand-rolled version this replaced had already discovered that and teleported
      for the same reason; doing it here means the 25 call sites do not each have
      to know whether their container happens to clip.

      `z-300` clears the `z-200` modal layer. Teleporting to `body` escapes the
      card's clipping but also leaves the stacking context the trigger was in, so
      a reveal opened from inside a dialog — an entity's detail modal has one in
      its header — would otherwise render behind the backdrop that dimmed it.
    -->
    <Teleport to="body">
      <div
        v-if="open && !useSheet"
        ref="popoverRef"
        class="fixed z-300 w-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
        :style="popoverStyle"
        role="dialog"
        :aria-label="title"
      >
        <RevealBody
          :party="party"
          :adapter="adapter"
          :state="state"
          @close="open = false"
        >
          <slot name="what" />
        </RevealBody>
      </div>
    </Teleport>

    <!-- Small-screen presentation: same body, room to breathe -->
    <MobileSheet v-if="useSheet" v-model:open="open" :title="title">
      <RevealBody
        :party="party"
        :adapter="adapter"
        :state="state"
        @close="open = false"
      >
        <slot name="what" />
      </RevealBody>
    </MobileSheet>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { CARD_OVERLAY_ACTION, ICON_TOUCH_TARGET } from "@/components/common/appButtonVariants";
import MobileSheet from "@/components/common/MobileSheet.vue";
import RevealBody from "@/components/common/RevealBody.vue";
import { useHotkeys } from "@/composables/useHotkeys";
import { useParty } from "@/composables/party/useParty";
import { IconHide, IconReveal } from "@/lib/icons";
import { revealLabel, revealState } from "@/lib/reveal";
import type { RevealAdapter, RevealForm } from "@/lib/reveal";

const { adapter, entityName, form = "button" } = defineProps<{
  /** Bridges whichever storage model this entity uses. See `lib/reveal`. */
  adapter: RevealAdapter;
  /** Used in the control's title and the sheet's heading. */
  entityName?: string;
  /**
   * The three shapes this control comes in. Deliberately an enum rather than
   * loose size/label props: the point of one reveal control is that a DM
   * recognises it instantly, and nineteen call sites each choosing their own
   * size and label is how the previous four variants came about.
   *
   *   button  — icon plus the current audience ("Hidden", "3 players",
   *             "Whole party"). For detail headers and action rows, where
   *             there is room to say what the state actually is.
   *   overlay — icon only, floating on a translucent dark scrim. ONLY where it
   *             sits on top of artwork: a portrait, an illustration, a mobile
   *             hero image. The scrim is what keeps it legible there.
   *   inline  — icon only, in the theme's own colours, in the flow of a row.
   *             For cards and rows with no artwork under the control.
   *
   * `inline` exists because `overlay` was used on all of them (#750), and the
   * scrim is not a neutral default — it is a fixed near-black box, so on a note
   * card or a faction row it lands as an unexplained dark square on parchment,
   * and the state colour inside it stops resolving (see `buttonProps`). The
   * question a call site has to answer is not "is this a card?" but "is there a
   * picture behind this control?".
   *
   * Both icon forms are `icon-xs`, sized to the card action pills they stand
   * next to (the Edit chip on an NPC or monster card) rather than to a
   * comfortable standalone icon button — two controls in the same corner at two
   * different heights read as a mistake. Both take the 44px thumb target back
   * below `md` via `ICON_TOUCH_TARGET`, which is the same trade the `md` button
   * size makes. Keeping `inline` to that same 1.5rem box is also what stops
   * moving the control out of a row's text block from costing that block width:
   * a larger one pushed faction names into truncating and their tag rows into
   * wrapping.
   */
  form?: RevealForm;
}>();

const { data: partyData } = useParty();
const party = computed(() => partyData.value ?? []);
const partyIds = computed(() => party.value.map((m) => m.id));

const state = computed(() => revealState(partyIds.value, adapter.isMemberVisible));
const sharedCount = computed(() => partyIds.value.filter(adapter.isMemberVisible).length);
const label = computed(() => revealLabel(state.value, sharedCount.value));

const title = computed(() =>
  entityName ? `Reveal ${entityName} to players` : "Reveal to players",
);

/**
 * How each `form` dresses the trigger. One computed rather than a ternary per
 * attribute: with three forms the per-attribute chains stopped saying which
 * combinations actually exist, and the `overlay` row below is a set of choices
 * that only make sense together.
 *
 *   overlay — a small, always-visible, icon-only chip on a dark translucent
 *     scrim. Dark rather than theme-tinted because this form sits on top of
 *     artwork, where a background that follows the theme disappears against
 *     half the pictures in the app; it is also what every other action chip in
 *     that same corner already does (the Edit chip on an NPC or monster card,
 *     the mobile app-bar buttons), and two controls side by side in two
 *     different treatments read as an accident.
 *
 *     Both state colours are therefore *fixed light*, for the same reason the
 *     scrim is fixed dark. `text-primary` was wrong here and looked right in
 *     review: on the dark theme `--primary` is a bright gold that reads on
 *     black, but on the default light theme it is `hsl(42 90% 35%)` — a dark
 *     amber picked to sit on parchment — so the "someone can see this" chip
 *     rendered as a featureless olive smear at roughly 1.4:1 against its own
 *     scrim, and a DM could not tell it from the hidden one. A token that
 *     follows the theme cannot survive a background that does not, so the pair
 *     is `gold-300` and white, both chosen against the scrim rather than
 *     against the page. The hover colours are pinned too — `ghost` would
 *     otherwise pull the text back to `foreground` and lose the distinction on
 *     the one interaction where the DM is looking straight at it.
 *
 *   button / inline — the same variants, and `inline` is simply the labelled
 *     one with its label removed: `subtle`'s bordered box while hidden,
 *     `tinted` primary once someone can see it, `strong` once that is the whole
 *     party. Both take their colours from the theme, because unlike `overlay`
 *     they sit on the page's own background.
 */
const buttonProps = computed(() => {
  if (form === "overlay") {
    return {
      variant: "ghost",
      size: "icon-xs",
      class: [
        CARD_OVERLAY_ACTION,
        state.value === "private"
          ? "text-white hover:text-white"
          : "text-gold-300 hover:text-gold-300",
      ],
      ariaLabel: title.value,
    } as const;
  }
  // `inline` is the `button` form with its label taken away, deliberately down
  // to the variant. A first cut gave it no chrome at all — bare `ghost` and
  // `link` glyphs — on the reasoning that a list row should stay quiet. On a
  // pantheon row that turned out to be unreadable: with no box, a muted
  // eye-slash on a card reads as a decorative status glyph rather than
  // something you can press, which is the exact failure this control was
  // written to end. Quiet is not the same as invisible, and a bordered box is
  // what the rest of the app uses to say "this is a control".
  const stateful = {
    variant: state.value === "private" ? "subtle" : "tinted",
    tone: state.value === "private" ? undefined : "primary",
    emphasis: state.value === "everyone" ? "strong" : "soft",
  } as const;

  if (form === "inline") {
    return { ...stateful, size: "icon-xs", class: ICON_TOUCH_TARGET, ariaLabel: title.value } as const;
  }
  return { ...stateful, size: "sm", label: label.value } as const;
});

const open = ref(false);

/**
 * Escape closes the popover — and only the popover.
 *
 * It had no key handling at all, which was survivable while it only ever
 * appeared over a page: nothing else was listening, so Escape did nothing and
 * the DM clicked away. It stopped being survivable once an entity's detail
 * modal put one in its header, because the modal *is* listening — so opening
 * the reveal and pressing Escape threw away the whole sheet you were reading.
 *
 * The overlay layer's rule is that the most recently registered Escape wins and
 * hands it back on unmount, so registering here makes the popover the one that
 * answers while it is open, and the modal underneath answers again once it is
 * not. Enabled only while open, so the ~25 cards each holding one of these
 * never suppress the page's own shortcuts.
 */
useHotkeys(
  () => [
    {
      combo: "escape",
      description: "Close reveal",
      hidden: true,
      handler: () => { open.value = false; },
    },
  ],
  { layer: "overlay", enabled: () => open.value },
);
const containerRef = ref<HTMLElement | null>(null);

/**
 * Presentation follows the pointer, not the entity. A popover anchored to a
 * button is wrong on a narrow screen — it lands half off-viewport and the touch
 * targets inside are too small — so below `md` the same body opens as a sheet.
 */
const useSheet = ref(false);
const media = typeof window !== "undefined" ? window.matchMedia("(max-width: 47.9375rem)") : null;
function syncPresentation() {
  useSheet.value = media?.matches ?? false;
}

/** `w-64`. Known rather than measured, so the first paint is already in place. */
const POPOVER_W = 256;
/** Enough of the body to be worth opening downward for. */
const POPOVER_H_EST = 320;
const GAP = 4;
/** Never let an edge touch the viewport. */
const MARGIN = 8;

const popoverRef = ref<HTMLElement | null>(null);
const popoverStyle = ref<Record<string, string>>({});

/**
 * Places the popover against the trigger, biased away from whichever edges are
 * close.
 *
 * Teleporting to `body` escapes the card's clipping but forfeits the anchoring
 * that `absolute` gave for free, so both axes are worked out here:
 *
 *   vertical   — below the trigger, unless the room below is less than the body
 *                needs *and* there is more room above. Either way `maxHeight` is
 *                capped to the space actually available and the body scrolls, so
 *                a long party list cannot run off the top or the bottom.
 *   horizontal — right edge aligned to the trigger's, then clamped into the
 *                viewport. Clamping rather than flipping, because a control near
 *                the left edge (a card's top-left chip) and one near the right
 *                (a page header) both just need to stay on screen; a flag for
 *                each case was two ways to be slightly wrong.
 */
function computePosition() {
  const el = containerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spaceBelow = vh - rect.bottom - GAP - MARGIN;
  const spaceAbove = rect.top - GAP - MARGIN;
  const openUpward = spaceBelow < Math.min(POPOVER_H_EST, spaceAbove);

  const left = Math.max(
    MARGIN,
    Math.min(rect.right - POPOVER_W, vw - POPOVER_W - MARGIN),
  );

  popoverStyle.value = openUpward
    ? { left: `${left}px`, bottom: `${vh - rect.top + GAP}px`, maxHeight: `${spaceAbove}px` }
    : { left: `${left}px`, top: `${rect.bottom + GAP}px`, maxHeight: `${spaceBelow}px` };
}

function toggleOpen() {
  if (!open.value) {
    syncPresentation();
    computePosition();
  }
  open.value = !open.value;
}

/**
 * A teleported popover is not a descendant of `containerRef`, so a click inside
 * it reads as "outside" and would close the control on its own checkboxes.
 */
function onOutsideClick(event: MouseEvent) {
  if (useSheet.value) return; // the sheet owns its own dismissal
  const target = event.target as Node;
  if (containerRef.value?.contains(target)) return;
  if (popoverRef.value?.contains(target)) return;
  open.value = false;
}

// Anchored to a rect rather than to an ancestor, so it has to be recomputed
// while open. `capture` because the page scrolls in an inner container, not on
// `window` — a bubbling listener never hears it.
watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener("scroll", computePosition, true);
    window.addEventListener("resize", computePosition);
  } else {
    window.removeEventListener("scroll", computePosition, true);
    window.removeEventListener("resize", computePosition);
  }
});

onMounted(() => {
  syncPresentation();
  media?.addEventListener("change", syncPresentation);
  document.addEventListener("mousedown", onOutsideClick);
});
onUnmounted(() => {
  media?.removeEventListener("change", syncPresentation);
  document.removeEventListener("mousedown", onOutsideClick);
  window.removeEventListener("scroll", computePosition, true);
  window.removeEventListener("resize", computePosition);
});
</script>
