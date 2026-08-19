<template>
  <Teleport to="body">
    <!--
      `:css="false"` — enter and leave are both driven from JS below, because
      the enter animation is not knowable at author time: a modal opened from a
      grid card flies out of that card's rect, and a modal opened from a deep
      link has no rect to fly from. One of those is a computed transform and the
      other is a plain fade, so there is no pair of CSS classes that covers both.
    -->
    <Transition :css="false" @enter="onEnter" @leave="onLeave" @after-leave="emit('afterLeave')">
      <div
        v-if="open"
        class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="onBackdropClick"
      >
        <!--
          `pointer-events-none` so the mousedown lands on the container above,
          where `.self` can tell "clicked outside the panel" from "clicked the
          panel". With the backdrop swallowing the event instead, `.self` never
          matches and dismiss-on-backdrop quietly does nothing.
        -->
        <div data-modal-backdrop class="pointer-events-none absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <!--
          `focus:outline-none`: the panel takes focus on open so a screen reader
          announces the dialog from its top, but it is `tabindex="-1"` and
          unreachable by Tab — so the ring marks something the user cannot have
          navigated to and reads as a stray highlight around the whole box.
          Every control inside keeps its own focus styling.

          `max-h-full` goes through `cn()` rather than sitting in the static
          class: tailwind-merge can only dedupe what it is handed, so a default
          left outside it is not a default at all — it simply wins, and a caller
          passing its own height in `panelClass` gets silently ignored.
        -->
        <div
          ref="panelRef"
          data-modal-panel
          class="relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl focus:outline-none"
          :class="cn('w-full max-h-full', SIZES[size], panelClass)"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="labelledBy"
          :aria-label="labelledBy ? undefined : label"
          tabindex="-1"
          @keydown.tab="onTab"
        >
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The modal shell: backdrop, blur, panel chrome, dismissal, focus containment
 * and the open animation. Everything inside the panel is the caller's.
 *
 * It exists because the recipe already existed five times over — `ConfirmDialog`,
 * `PaywallModal`, `BugReportModal`, `ArtPickerModal` and a shelf of feature
 * dialogs each hand-rolled the same `Teleport` → fixed inset → `bg-black/60
 * backdrop-blur-sm` → `rounded-xl border border-border bg-card shadow-2xl`
 * stack, and each stopped at a slightly different point. None of them trap
 * focus, most route Escape through their own listener rather than the hotkey
 * layer, and the backdrop-click handler was copied in a form where it cannot
 * fire (see the note on the backdrop above). A sixth copy was not worth
 * writing.
 */
import { ref } from "vue";
import { useHotkeys } from "@/composables/useHotkeys";
import { cn } from "@/lib/utils";
import { takeModalOrigin } from "@/lib/modalOrigin";
import { canAnimate, originTransform, REST_TRANSFORM } from "@/lib/motion";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-none",
} as const;

const {
  open,
  size = "md",
  panelClass,
  labelledBy,
  label,
  originKey,
  dismissable = true,
} = defineProps<{
  open: boolean;
  /** Panel width. Height and anything else comes in through `panelClass`. */
  size?: keyof typeof SIZES;
  panelClass?: string;
  /** Id of the element naming this dialog — usually the panel's own heading. */
  labelledBy?: string;
  /** Fallback name, for a panel with no visible heading to point at. */
  label?: string;
  /**
   * Destination this modal was opened towards. When a click recorded an origin
   * rect for it (see `modalOrigin`), the panel grows out of that element
   * instead of fading in.
   */
  originKey?: string;
  /** Escape and backdrop click close the modal. Default true. */
  dismissable?: boolean;
}>();

const emit = defineEmits<{
  /** Escape, backdrop or a caller's own control asked for dismissal. */
  close: [];
  /**
   * The panel has finished animating out. A route-driven modal navigates here
   * rather than on `close`, so the exit is seen rather than cut off by the
   * unmount that a route change brings.
   */
  afterLeave: [];
}>();

const panelRef = ref<HTMLElement | null>(null);

/**
 * Escape goes through the hotkey registry rather than a `document` listener, so
 * stacked overlays hand it back and forth in the order they opened — a picker
 * inside this modal closes itself first, and only a second Escape closes the
 * modal. `allowInTextEntry` because a dialog containing a search field still
 * has to close from inside that field.
 */
useHotkeys(
  () => [
    {
      combo: "escape",
      description: "Close dialog",
      hidden: true,
      allowInTextEntry: true,
      handler: () => emit("close"),
    },
  ],
  { layer: "overlay", enabled: () => open && dismissable },
);

function onBackdropClick() {
  if (dismissable) emit("close");
}

// ── Focus ────────────────────────────────────────────────────────────────────

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** What had focus when the modal opened, so it can be handed back on close. */
let focusOnClose: HTMLElement | null = null;

function focusables(): HTMLElement[] {
  const panel = panelRef.value;
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // `offsetParent` is null for anything `display:none` — a collapsed accordion
    // section, an inactive tab panel — which must not become a Tab stop.
    (el) => el.offsetParent !== null,
  );
}

/**
 * The panel is teleported to `body`, so it has no ancestor to contain Tab: left
 * alone, tabbing out of the last control walks into the page behind the
 * backdrop, where every stop is invisible and unclickable.
 */
function onTab(event: KeyboardEvent) {
  const items = focusables();
  if (!items.length) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || active === panelRef.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

// ── Animation ────────────────────────────────────────────────────────────────

const ENTER_MS = 260;
const FADE_MS = 180;
const LEAVE_MS = 140;

function parts(root: Element) {
  return {
    backdrop: root.querySelector<HTMLElement>("[data-modal-backdrop]"),
    panel: root.querySelector<HTMLElement>("[data-modal-panel]"),
  };
}

function settle(animations: Animation[], done: () => void) {
  Promise.all(animations.map((a) => a.finished))
    .then(done)
    // A cancelled animation rejects. The modal is still open either way, so the
    // transition has to be told it finished or Vue leaves it mid-flight.
    .catch(done);
}

function onEnter(el: Element, done: () => void) {
  focusOnClose = (document.activeElement as HTMLElement | null) ?? null;
  const { backdrop, panel } = parts(el);
  if (!backdrop || !panel || !canAnimate(el)) {
    panel?.focus();
    done();
    return;
  }

  // Consumed unconditionally, even when it turns out to be null: an origin left
  // unread would be collected by whichever modal opens next.
  const origin = originKey ? takeModalOrigin(originKey) : null;
  const to = panel.getBoundingClientRect();

  // Without an origin there is nowhere to fly from, so the panel swells very
  // slightly instead — the honest animation for "this did not come from
  // anywhere on screen".
  const from = origin ? originTransform(origin, to) : "scale(0.96)";

  settle(
    [
      backdrop.animate({ opacity: [0, 1] }, { duration: FADE_MS, easing: "ease-out" }),
      panel.animate(
        { transform: [from, REST_TRANSFORM], opacity: [origin ? 0.4 : 0, 1] },
        {
          duration: origin ? ENTER_MS : FADE_MS,
          // Overshoot-free ease-out: the panel arrives rather than bounces.
          easing: origin ? "cubic-bezier(0.22, 1, 0.36, 1)" : "ease-out",
        },
      ),
    ],
    done,
  );

  panel.focus();
}

function onLeave(el: Element, done: () => void) {
  // Handed back before the panel goes, so focus is never left on a detached
  // element — which would drop it to <body> and lose the user's place.
  focusOnClose?.focus();
  focusOnClose = null;

  const { backdrop, panel } = parts(el);
  if (!backdrop || !panel || !canAnimate(el)) {
    done();
    return;
  }

  settle(
    [
      backdrop.animate({ opacity: [1, 0] }, { duration: LEAVE_MS, easing: "ease-in" }),
      panel.animate(
        { transform: ["scale(1)", "scale(0.97)"], opacity: [1, 0] },
        { duration: LEAVE_MS, easing: "ease-in" },
      ),
    ],
    done,
  );
}
</script>
