import { onBeforeUnmount, watchEffect, type Ref } from "vue";

/**
 * Publishes how much of the viewport's bottom edge the deck takes as
 * `--dock-bottom` on <html>, so the fixed layers that hug that edge (the AI
 * badge, the phone's scratchpad and chat panels, DockBar) sit above it instead
 * of under it. Pass `null` for a deck that covers rather than pushes. See
 * base.css for the contract.
 */
export function useDockBottom(el: Ref<HTMLElement | null>, active: Ref<boolean>): void {
  const root = document.documentElement;
  let observer: ResizeObserver | null = null;

  function clear(): void {
    observer?.disconnect();
    observer = null;
    root.style.removeProperty("--dock-bottom");
  }

  watchEffect(() => {
    clear();
    const node = el.value;
    if (!active.value || node === null) return;
    const publish = (): void => root.style.setProperty("--dock-bottom", `${node.getBoundingClientRect().height}px`);
    publish();
    if (typeof ResizeObserver === "undefined") return;
    observer = new ResizeObserver(publish);
    observer.observe(node);
  });

  onBeforeUnmount(clear);
}
