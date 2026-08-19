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
