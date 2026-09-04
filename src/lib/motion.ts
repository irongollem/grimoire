/**
 * The app's shared motion language.
 *
 * Panels that open from something on screen fly out of it rather than fading in
 * from nowhere. That is one effect, but it had been written out three times —
 * AppModal, ImageLightbox and the soundboard widget — as the same expression
 * copied by hand, with the reduced-motion guard copied alongside it four more
 * times. Identical today, but a set of animations meant to read as one system is
 * exactly the thing that must not drift apart one call site at a time.
 *
 * The rect type stays in `modalOrigin`, which documents what an origin *is* and
 * owns the single-slot handoff for the case where the clicked element and the
 * panel never meet. This module only does the arithmetic.
 */
import type { ModalOrigin } from "./modalOrigin";

/** Honours the OS "reduce motion" setting. Safe where `matchMedia` is absent. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Bring an element into view inside whatever actually scrolls it, and do
 * nothing at all when it is already visible.
 *
 * `block: "nearest"` is doing the work: the spec defines it as "scroll the
 * minimum amount", which means an element already on screen is left exactly
 * where it is. That matters more than it sounds — the alternative, centring
 * unconditionally, moves the board under a DM who could already see the thing
 * that moved, and this module exists partly because a dashboard that shifts
 * when you touch it is unjudgeable.
 *
 * Pair it with a `scroll-mt-*` class on the target when something is anchored
 * *above* the element's border box. Customize mode's control pill is
 * `absolute bottom-full`, so it sits outside the box `scrollIntoView`
 * measures, and without a scroll margin an element scrolled flush to the top
 * takes its own controls off screen.
 *
 * Guarded like `canAnimate`: `scrollIntoView` is not implemented in the test
 * DOM, and an unguarded call makes a component untestable rather than merely
 * unscrolled.
 */
export function revealInScrollParent(el: Element): void {
  if (typeof el.scrollIntoView !== "function") return;
  el.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

/**
 * Whether to animate at all. Web Animations is absent in the test DOM, so there
 * every panel opens instantly — as it does for anyone who asked it to.
 */
export function canAnimate(el: Element): boolean {
  return typeof (el as HTMLElement).animate === "function" && !prefersReducedMotion();
}

/** Where every origin flight lands. */
export const REST_TRANSFORM = "translate(0, 0) scale(1)";

/**
 * The `transform` a panel starts from so it appears to grow out of `origin` and
 * land on `to`.
 *
 * Pixels, because this is a measured flight path between two real rects, not a
 * design value — there is no rem equivalent of "where that card is".
 */
export function originTransform(origin: ModalOrigin, to: ModalOrigin): string {
  const dx = origin.left + origin.width / 2 - (to.left + to.width / 2);
  const dy = origin.top + origin.height / 2 - (to.top + to.height / 2);
  // Never scale up. An origin wider than its destination — a full-width row
  // opening a narrow panel — should still open at its own size rather than
  // shrink into place. A destination measured before layout has no width and so
  // no meaningful ratio; it takes 1 too, rather than the NaN that would void the
  // whole transform string and drop the animation silently.
  const scale = to.width > 0 ? Math.min(1, origin.width / to.width) : 1;
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

/**
 * Tells Vue a transition finished, whether the animation reached the end or was
 * cancelled.
 *
 * A cancelled animation *rejects*. Left uncaught, the panel is already open (or
 * already shut) but Vue never hears that the transition ended, so it sits
 * mid-flight forever — which is why every caller needs this and none should
 * write it again.
 */
export function whenSettled(animations: Animation | Animation[], done: () => void): void {
  const all = Array.isArray(animations) ? animations : [animations];
  Promise.all(all.map((a) => a.finished))
    .then(() => done())
    .catch(() => done());
}

/** A drawer is a disclosure, not a reveal — it should feel like it just opened. */
const REVEAL_MS = 200;

/**
 * Which way a panel opens. `block` is a drawer folding down from a header;
 * `inline` is a rail arriving from the side of the page.
 */
export type RevealAxis = "block" | "inline";

/** The resting box a panel opens to, measured while it is in the DOM. */
export interface RevealBox {
  /** Border-box extent along the axis: the scroll size plus both borders. */
  size: number;
  /** Top/left, then bottom/right — the two edges the axis travels between. */
  startPadding: string;
  endPadding: string;
  startBorder: string;
  endBorder: string;
}

/** The CSS properties an axis collapses, in `[size, padding×2, border×2]` order. */
function axisProps(axis: RevealAxis): [string, string, string, string, string] {
  return axis === "block"
    ? ["height", "paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"]
    : ["width", "paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"];
}

/**
 * The two ends of a panel's travel — collapsed first, open second.
 *
 * `height: auto` cannot be animated (nor can `width: auto`), so a panel has to be
 * measured and then driven between two explicit boxes. Padding and borders
 * travel with the size because they have to: left at their resting values, a
 * padded panel shuts onto a stub of empty card, and one with an edge rule — the
 * common shapes, a line under an accordion header or down the side of a rail —
 * leaves that line hanging when there is nothing behind it.
 */
export function revealKeyframes(axis: RevealAxis, box: RevealBox): [Keyframe, Keyframe] {
  const [size, startPad, endPad, startBorder, endBorder] = axisProps(axis);
  return [
    {
      [size]: "0px",
      [startPad]: "0px",
      [endPad]: "0px",
      [startBorder]: "0px",
      [endBorder]: "0px",
      opacity: 0,
    },
    {
      [size]: `${box.size}px`,
      [startPad]: box.startPadding,
      [endPad]: box.endPadding,
      [startBorder]: box.startBorder,
      [endBorder]: box.endBorder,
      opacity: 1,
    },
  ];
}

/** A computed CSS length in px. Absent (no computed style at all) reads as zero. */
function px(value: string): number {
  return Number.parseFloat(value) || 0;
}

function revealTransition(axis: RevealAxis, duration: number) {
  function run(el: Element, closing: boolean, done: () => void) {
    const node = el as HTMLElement;
    if (!canAnimate(node)) {
      done();
      return;
    }
    const cs = getComputedStyle(node);
    const [, startPad, endPad, startBorder, endBorder] = axisProps(axis);
    // `scrollWidth`/`scrollHeight` count content and padding but not borders, and
    // every box in this app is border-box — so a bordered panel measured without
    // them opens a hairline short and clips its own last row.
    const scroll = axis === "block" ? node.scrollHeight : node.scrollWidth;
    const [shut, open] = revealKeyframes(axis, {
      size: scroll + px(cs[startBorder as "borderTopWidth"]) + px(cs[endBorder as "borderTopWidth"]),
      startPadding: cs[startPad as "paddingTop"],
      endPadding: cs[endPad as "paddingTop"],
      startBorder: cs[startBorder as "borderTopWidth"],
      endBorder: cs[endBorder as "borderTopWidth"],
    });
    // Clipped while it travels, or the contents hang out of the shrinking box.
    // Restored rather than blanked: the panel may want its own overflow open.
    const overflow = node.style.overflow;
    node.style.overflow = "hidden";
    const finish = () => {
      node.style.overflow = overflow;
      done();
    };
    whenSettled(
      node.animate(closing ? [open, shut] : [shut, open], {
        duration,
        easing: closing ? "ease-in" : "cubic-bezier(0.22, 1, 0.36, 1)",
      }),
      finish,
    );
  }

  return {
    css: false,
    onEnter: (el: Element, done: () => void) => run(el, false, done),
    onLeave: (el: Element, done: () => void) => run(el, true, done),
  };
}

/**
 * Transition hooks for a drawer — a block that opens downward to whatever height
 * its content needs. `<Transition v-bind="drawerTransition()">`.
 *
 * Prefer `v-show` over `v-if`. A drawer's contents are usually live — a fader
 * mid-drag, a field mid-edit — and `v-if` throws that away and rebuilds it on
 * every open. Vue clears `display` before the enter hook runs, so the panel can
 * still be measured.
 *
 * The element it wraps must be a single node owning its own padding and borders:
 * both collapse with the height, so the rule under an accordion header goes with
 * the drawer rather than being left over nothing.
 */
export function drawerTransition(duration = REVEAL_MS) {
  return revealTransition("block", duration);
}

/**
 * Transition hooks for a rail — an in-flow side panel that opens horizontally,
 * pushing the page over rather than covering it. `<Transition v-bind="railTransition()">`.
 *
 * Give the rail a **fixed-width child** and let the rail itself size to it. The
 * rail is clipped while it travels, so a child that is `w-full` reflows to the
 * shrinking box — sliders squeezing, text rewrapping — whereas a fixed child
 * holds its shape and simply slides out from behind the page edge, which is what
 * "slides in from the right" means. Put the border, radius and background on
 * that child too, or the chrome travels without its contents.
 */
export function railTransition(duration = REVEAL_MS) {
  return revealTransition("inline", duration);
}

/**
 * A card turning over — a real rotation about its own vertical axis, not a
 * cross-fade between two faces.
 *
 * Distinct from the FLIP technique below despite the shared word: that one is
 * First-Last-Invert-Play, a reorder; this one is a playing card.
 *
 * Slower than any other motion here — a panel's short hop is 260ms and a grid
 * reorder 220ms — because a turn has to be *seen to rotate*. Under about 400ms
 * the two faces read as an instant swap, which is precisely the "nothing
 * happened" a turn is being used to cure. It is also the only motion in this
 * module that carries state rather than decorating a change: a face-down card
 * is what "this one is in play" looks like, so it is allowed the time to say so.
 */
export const CARD_TURN_MS = 520;

/**
 * Inline style for the 3D layer of a two-faced card. Its parent owns the
 * perspective; its two children are `backface-hidden`, the back pre-rotated.
 *
 * Reduce-motion zeroes the duration rather than dropping the turn, because the
 * rotation is not the point — the resting face is. A reader who asked for less
 * motion must still end up looking at the back of a card that has been played.
 */
export function cardTurnStyle(turned: boolean): Record<string, string> {
  return {
    transform: turned ? "rotateY(180deg)" : "rotateY(0deg)",
    transitionDuration: prefersReducedMotion() ? "0ms" : `${CARD_TURN_MS}ms`,
  };
}

/**
 * FLIP for a grid reorder: the elements are already in the DOM on both sides
 * of a list mutation, and this makes the jump from "before" to "after"
 * legible instead of a hard cut.
 *
 * Vue applies a reactive mutation asynchronously — a `nextTick` away — so
 * this cannot be a single call. The site has to bracket the mutation itself,
 * in this exact order:
 *
 * ```ts
 * const snapshot = captureFlipPositions(cardEls.values());
 * items.value = reordered;       // the mutation
 * await nextTick();              // let Vue apply it to the DOM
 * playFlipTransition(snapshot);  // then animate from old rects to new ones
 * ```
 *
 * Only position moves. Opacity and scale are left alone — a reorder is not
 * an appearance or a resize, and animating either would say something the
 * interaction does not mean.
 */

/**
 * The minimum shape `flipDelta` needs from a rect. A real `DOMRect`
 * satisfies this structurally, but the pure function does not require one,
 * so it stays testable with plain objects and no DOM.
 */
export interface FlipRect {
  left: number;
  top: number;
}

/**
 * Rects captured before a mutation, keyed by the element itself so
 * `playFlipTransition` can look each one up again once the DOM has moved.
 */
export type FlipSnapshot = Map<Element, FlipRect>;

/**
 * A grid reorder is a short hop between adjacent cells — less travel than
 * AppModal's flight from a click to the centre of the screen (260ms), so a
 * touch quicker reads as responsive rather than sluggish without becoming a
 * flicker.
 */
export const FLIP_MS = 220;

/**
 * Below this, a "move" is layout rounding, not a reorder — subpixel drift
 * that turns up even on an element whose grid position did not change.
 * Without a floor, every mutation would play a barely-visible twitch on
 * elements that never actually moved.
 */
export const FLIP_MOVE_THRESHOLD_PX = 1;

/**
 * How far an element travelled between two rects, in DOM/screen coordinates
 * — positive `dx` is rightward, positive `dy` is downward. Both collapse to
 * zero under `FLIP_MOVE_THRESHOLD_PX`, so an element that did not visibly
 * move is reported as unmoved rather than animated in place.
 *
 * This is the raw movement, not yet a transform: `playFlipTransition`
 * negates it to paint the element back at its `before` position before
 * animating it to `REST_TRANSFORM`.
 */
export function flipDelta(before: FlipRect, after: FlipRect): { dx: number; dy: number } {
  const dx = after.left - before.left;
  const dy = after.top - before.top;
  return {
    dx: Math.abs(dx) < FLIP_MOVE_THRESHOLD_PX ? 0 : dx,
    dy: Math.abs(dy) < FLIP_MOVE_THRESHOLD_PX ? 0 : dy,
  };
}

/**
 * Records where each element sits *before* the mutation that is about to
 * move it. Call this first — a rect read after the mutation is just the
 * "after" half of FLIP with no "before" left to animate from.
 */
export function captureFlipPositions(elements: Iterable<Element>): FlipSnapshot {
  const snapshot: FlipSnapshot = new Map();
  for (const el of elements) {
    snapshot.set(el, el.getBoundingClientRect());
  }
  return snapshot;
}

/**
 * Plays each element from its captured position to wherever it now sits.
 * Call once the DOM reflects the mutation `captureFlipPositions` was taken
 * before.
 *
 * Skips entirely under reduced motion, and per element when Web Animations
 * is unavailable (the test DOM), the element has since left the document, or
 * it did not move past `FLIP_MOVE_THRESHOLD_PX` — all silent no-ops rather
 * than a thrown error, the same contract `canAnimate` gives every other
 * animation in this module.
 */
export function playFlipTransition(snapshot: FlipSnapshot, duration = FLIP_MS): void {
  if (prefersReducedMotion()) return;
  for (const [el, before] of snapshot) {
    if (!el.isConnected || !canAnimate(el)) continue;
    const { dx, dy } = flipDelta(before, el.getBoundingClientRect());
    if (dx === 0 && dy === 0) continue;
    // Invert: paint the element where it used to be, then let it travel to
    // REST_TRANSFORM — the only motion visible is the slide into place.
    (el as HTMLElement).animate(
      [{ transform: `translate(${-dx}px, ${-dy}px)` }, { transform: REST_TRANSFORM }],
      { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }
}
