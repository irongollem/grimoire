import { ref, watch, nextTick, onBeforeUnmount, type Ref, type CSSProperties } from "vue";
import { computeAnchoredPosition } from "@/lib/floatingPosition";

/**
 * Drives a body-teleported floating panel anchored to a trigger element.
 *
 * Teleporting to <body> plus `position: fixed` makes the panel immune to any
 * ancestor `overflow: hidden` — the reason inline/absolute pickers get clipped
 * inside the encounter runner's scroll panels. Repositions on scroll (capture, so
 * it also tracks the inner panel scrolling) and resize; dismisses on outside-click
 * and Escape.
 */
export function useAnchoredPopover(
  // `Element`, not `HTMLElement`: the relationship web anchors to an SVG node
  // inside the graph, and everything used here — getBoundingClientRect,
  // contains — is on Element. Widening a parameter breaks no existing caller.
  triggerRef: Ref<Element | null>,
  isOpen: Ref<boolean>,
  onDismiss: () => void,
) {
  const floatingRef = ref<HTMLElement | null>(null);
  const floatingStyle = ref<CSSProperties>({ position: "fixed", top: "0px", left: "0px", visibility: "hidden" });

  function reposition() {
    const trigger = triggerRef.value;
    const floating = floatingRef.value;
    if (!trigger || !floating) return;
    const t = trigger.getBoundingClientRect();
    const { top, left } = computeAnchoredPosition(
      { top: t.top, left: t.left, right: t.right, bottom: t.bottom, width: t.width, height: t.height },
      { width: floating.offsetWidth, height: floating.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    floatingStyle.value = { position: "fixed", top: `${top}px`, left: `${left}px`, visibility: "visible" };
  }

  function onScrollOrResize() {
    if (isOpen.value) reposition();
  }

  function onOutsidePointer(e: PointerEvent) {
    const target = e.target as Node;
    if (floatingRef.value?.contains(target)) return;
    if (triggerRef.value?.contains(target)) return; // let the trigger toggle itself
    onDismiss();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onDismiss();
  }

  function attach() {
    // Capture phase so scrolling of the inner detail panel (not just window) repositions us.
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("pointerdown", onOutsidePointer, true);
    document.addEventListener("keydown", onKeydown);
  }

  function detach() {
    window.removeEventListener("scroll", onScrollOrResize, true);
    window.removeEventListener("resize", onScrollOrResize);
    document.removeEventListener("pointerdown", onOutsidePointer, true);
    document.removeEventListener("keydown", onKeydown);
  }

  watch(isOpen, async (open) => {
    if (open) {
      floatingStyle.value = { ...floatingStyle.value, visibility: "hidden" };
      await nextTick();
      reposition();
      attach();
    } else {
      detach();
    }
  });

  onBeforeUnmount(detach);

  return { floatingRef, floatingStyle };
}
