/**
 * The test DOM has no Web Animations, on purpose and in writing.
 *
 * `src/lib/motion.ts` opens and closes panels with `el.animate()` when it can
 * (`canAnimate`) and otherwise hands control straight back to Vue — the same
 * path reduced-motion takes. Every transition test in the suite (motion.test,
 * AppModal, EntityDetailModal, …) is written against that immediate path, and
 * CLAUDE.md's Motion section states the assumption: "Web Animations is absent
 * in the test DOM".
 *
 * That used to be true by accident. happy-dom 20.14 implemented
 * `Element.prototype.animate`, which silently moved every one of those tests
 * onto the animated path, where a leave animation never finishes and a
 * closing modal never announces it has gone (Dependabot #890). Removing it
 * here makes the assumption a property of the suite rather than of whichever
 * DOM library version is installed. A test that wants to exercise the
 * animated path stubs `animate` itself.
 */
if (typeof Element !== "undefined" && "animate" in Element.prototype) {
  Reflect.deleteProperty(Element.prototype, "animate");
}
