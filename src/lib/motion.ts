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
const DRAWER_MS = 200;

/** The resting box a drawer opens to, measured while it is in the DOM. */
export interface DrawerBox {
  /** Border-box height: `scrollHeight` (content + padding) plus the vertical borders. */
  height: number;
  paddingTop: string;
  paddingBottom: string;
  borderTopWidth: string;
  borderBottomWidth: string;
}

/**
 * The two ends of a drawer's travel — collapsed first, open second.
 *
 * `height: auto` cannot be animated, so a drawer has to be measured and then
 * driven between two explicit boxes. Padding and borders travel with the height
 * because they have to: left at their resting values, a drawer with vertical
 * padding never reaches zero and closes onto a stub of empty card, and one with
 * a top rule — the common accordion shape, a line under the header — leaves that
 * line hanging when there is nothing under it.
 */
export function drawerKeyframes(box: DrawerBox): [Keyframe, Keyframe] {
  return [
    {
      height: "0px",
      paddingTop: "0px",
      paddingBottom: "0px",
      borderTopWidth: "0px",
      borderBottomWidth: "0px",
      opacity: 0,
    },
    {
      height: `${box.height}px`,
      paddingTop: box.paddingTop,
      paddingBottom: box.paddingBottom,
      borderTopWidth: box.borderTopWidth,
      borderBottomWidth: box.borderBottomWidth,
      opacity: 1,
    },
  ];
}

/** A computed CSS length in px. Absent (no computed style at all) reads as zero. */
function px(value: string): number {
  return Number.parseFloat(value) || 0;
}

/**
 * Transition hooks for a drawer: `<Transition v-bind="drawerTransition()">`.
 *
 * Pair it with `v-show`, not `v-if`. A drawer's contents are usually live — a
 * fader mid-drag, a field mid-edit — and `v-if` throws that away and rebuilds it
 * on every open. Vue clears `display` before the enter hook runs, so the panel
 * can still be measured.
 *
 * The element it wraps must be a single node owning its own padding and borders
 * — both collapse with the height, so the rule under an accordion header goes
 * with the drawer rather than being left behind over nothing.
 */
export function drawerTransition(duration = DRAWER_MS) {
  function run(el: Element, closing: boolean, done: () => void) {
    const node = el as HTMLElement;
    if (!canAnimate(node)) {
      done();
      return;
    }
    const cs = getComputedStyle(node);
    const [shut, open] = drawerKeyframes({
      // `scrollHeight` counts content and padding but not borders, and every box
      // in this app is border-box — so a bordered drawer measured without them
      // opens a hairline short and clips its own last row.
      height: node.scrollHeight + px(cs.borderTopWidth) + px(cs.borderBottomWidth),
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      borderTopWidth: cs.borderTopWidth,
      borderBottomWidth: cs.borderBottomWidth,
    });
    // Clipped while it travels, or the contents hang out of the shrinking box.
    // Restored rather than blanked: the drawer may want its own overflow open.
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
