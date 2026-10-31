import { ref } from "vue";

const MIN_WIDTH = 200;
const MAX_WIDTH = 700;

/**
 * The runner's stat block column is dragged wider or narrower from its left edge, by mouse or by
 * finger. Shared by the classic runner layout and the Play screen (#1125) so both resize alike.
 */
export function useDetailResize(initialWidth: number) {
  const detailWidth = ref(initialWidth);
  const clamp = (w: number) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w));

  function startMouse(e: MouseEvent) {
    const startX = e.clientX;
    const startWidth = detailWidth.value;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      detailWidth.value = clamp(startWidth + (startX - ev.clientX));
    }
    function onUp() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function startTouch(e: TouchEvent) {
    const startX = e.touches[0].clientX;
    const startWidth = detailWidth.value;
    document.body.style.userSelect = "none";

    function onMove(ev: TouchEvent) {
      detailWidth.value = clamp(startWidth + (startX - ev.touches[0].clientX));
    }
    function onEnd() {
      document.body.style.userSelect = "";
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    }
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  }

  return { detailWidth, startMouse, startTouch };
}
