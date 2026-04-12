import { onMounted, onUnmounted, ref } from "vue";

const THRESHOLD     = 72;   // px of pull needed to trigger reload
const MAX_PULL      = 96;   // max visual travel of the indicator
const TOP_ZONE      = 64;   // touch must start within this many px of the top of the screen

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
  let eligible  = false;   // true only when touch started in the top zone at scrollTop 0
  let pulling   = false;
  let container: Element | null = null;

  function onTouchStart(e: TouchEvent) {
    const touchY = e.touches[0].clientY;
    container = scrollableAncestor(e.target as Element);
    // Only arm pull-to-refresh when the finger starts at the very top of the screen
    // AND the scrollable container is already at the top.
    eligible = touchY <= TOP_ZONE && container.scrollTop <= 2;
    if (!eligible) return;
    startY  = touchY;
    pulling = false;
    pullPx.value = 0;
    readyToReload.value = false;
  }

  function onTouchMove(e: TouchEvent) {
    if (!eligible || !container || container.scrollTop > 2) return;
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
    eligible = false;
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
