import { onMounted, onUnmounted, ref } from "vue";

const THRESHOLD = 72;   // px of pull needed to trigger reload
const MAX_PULL  = 96;   // max visual travel of the indicator

// Walk up the DOM to find the first element that actually scrolls.
function scrollableAncestor(el: Element | null): Element {
  while (el && el !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(el);
    if (overflowY === "auto" || overflowY === "scroll") return el;
    el = el.parentElement;
  }
  return document.documentElement;
}

export function usePullToRefresh() {
  const pullPx        = ref(0);   // 0 → MAX_PULL
  const readyToReload = ref(false);

  let startY    = 0;
  let pulling   = false;
  let container: Element | null = null;

  function onTouchStart(e: TouchEvent) {
    container = scrollableAncestor(e.target as Element);
    if (container.scrollTop > 2) return;          // not at the top — ignore
    startY  = e.touches[0].clientY;
    pulling = false;
    pullPx.value = 0;
    readyToReload.value = false;
  }

  function onTouchMove(e: TouchEvent) {
    if (!container || container.scrollTop > 2) return;
    const delta = e.touches[0].clientY - startY;
    if (delta <= 4) return;

    pulling = true;
    // Rubber-band: compress the travel so it feels natural
    const raw = Math.min(delta * 0.45, MAX_PULL);
    pullPx.value = raw;
    readyToReload.value = raw >= THRESHOLD;

    // Suppress native scroll/overscroll bounce while we're in pull mode
    e.preventDefault();
  }

  function onTouchEnd() {
    if (pulling && readyToReload.value) {
      window.location.reload();
      return;
    }
    pulling = false;
    pullPx.value = 0;
    readyToReload.value = false;
    container = null;
  }

  onMounted(() => {
    document.addEventListener("touchstart",  onTouchStart, { passive: true });
    document.addEventListener("touchmove",   onTouchMove,  { passive: false });
    document.addEventListener("touchend",    onTouchEnd,   { passive: true });
    document.addEventListener("touchcancel", onTouchEnd,   { passive: true });
  });

  onUnmounted(() => {
    document.removeEventListener("touchstart",  onTouchStart);
    document.removeEventListener("touchmove",   onTouchMove);
    document.removeEventListener("touchend",    onTouchEnd);
    document.removeEventListener("touchcancel", onTouchEnd);
  });

  return { pullPx, readyToReload };
}
