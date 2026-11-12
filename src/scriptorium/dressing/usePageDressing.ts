/*
 * Page dressing on a surface that is one page (#1181): the player's reader and the document view. Both paint a
 * paper on one element and read a chapter on it, so that element is the page; the dressing is its first child,
 * behind the text, and `sc-dressed` (theme-base.css) makes the element the stacking context it sits in.
 *
 * The layer is added by hand, not by the template, because the host is also written to by something else (the
 * document view's host is the editor's own root). The class goes through the template, as Vue owns it.
 */
import { computed, onBeforeUnmount, watch, type ComputedRef } from "vue";
import { isDrawn, type Dressing } from "@/scriptorium/dressing/dressing";
import { buildDressingLayer } from "@/scriptorium/dressing/dressingLayer";

export function usePageDressing(
  host: () => HTMLElement | null | undefined,
  opts: { dressing: () => Dressing | null; handout: () => boolean },
): { dressed: ComputedRef<boolean> } {
  let layer: HTMLElement | null = null;
  const dressed = computed(() => isDrawn(opts.dressing()));

  function remove() {
    layer?.remove();
    layer = null;
  }

  function draw() {
    remove();
    const el = host();
    if (!el) return;
    // A reader is as tall as a phone and a standing handout as long as its text: the marks keep their shapes on either.
    const aspect = el.offsetWidth > 0 && el.offsetHeight > 0 ? el.offsetHeight / el.offsetWidth : undefined;
    layer = buildDressingLayer(opts.dressing(), 1, "text", { aspect, handout: opts.handout() });
    if (layer) el.prepend(layer);
  }

  watch([host, opts.dressing, opts.handout], draw, { flush: "post", immediate: true });
  onBeforeUnmount(remove);
  return { dressed };
}
