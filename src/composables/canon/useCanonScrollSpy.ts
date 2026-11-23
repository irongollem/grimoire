import { onBeforeUnmount, onMounted, type Ref } from "vue";

/** How far below the top of the scrolling area a part's heading must have passed to count as the one being read. */
const READING_LINE = 96;

/**
 * The part being read: the last one whose top has passed the reading line, the first when none has. At the very end
 * of the page the last part wins, because a short final part can never reach the line.
 */
export function partInView<T extends string>(tops: ReadonlyArray<{ id: T; top: number }>, line: number, atEnd: boolean): T | null {
  if (tops.length === 0) return null;
  if (atEnd) return tops[tops.length - 1].id;
  let current = tops[0].id;
  for (const part of tops) if (part.top <= line) current = part.id;
  return current;
}

/**
 * Moves the contents column's highlight as the page scrolls (#1255 item 32): before this it only moved on a click.
 *
 * A part chosen in the contents is held until the DM scrolls by hand again (wheel, touch or a key), so the smooth
 * scroll to it does not flash every part on the way, and a part too short to reach the top stays the one chosen.
 * It listens in the capture phase because a scroll event does not bubble and the page's scrolling element belongs to
 * `PageHeader`, at a different element by width.
 */
export function useCanonScrollSpy<T extends string>(ids: readonly T[], active: Ref<T>, elementId: (id: T) => string) {
  let held = false;
  let frame = 0;

  function read(scroller: Element) {
    frame = 0;
    if (held) return;
    const box = scroller.getBoundingClientRect();
    const tops = ids.flatMap((id) => {
      const el = document.getElementById(elementId(id));
      return el ? [{ id, top: el.getBoundingClientRect().top - box.top }] : [];
    });
    const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    const next = partInView(tops, READING_LINE, atEnd);
    if (next !== null && next !== active.value) active.value = next;
  }

  function onScroll(event: Event) {
    const scroller = event.target;
    if (!(scroller instanceof Element) || frame !== 0) return;
    // Only the element that holds the parts: a list scrolling inside the page is not the page.
    if (!scroller.querySelector(`#${CSS.escape(elementId(ids[0]))}`)) return;
    frame = requestAnimationFrame(() => read(scroller));
  }
  const release = () => { held = false; };

  onMounted(() => {
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    for (const type of ["wheel", "touchmove", "keydown"] as const) document.addEventListener(type, release, { passive: true });
  });
  onBeforeUnmount(() => {
    document.removeEventListener("scroll", onScroll, { capture: true });
    for (const type of ["wheel", "touchmove", "keydown"] as const) document.removeEventListener(type, release);
    if (frame !== 0) cancelAnimationFrame(frame);
  });

  /** Call when a part is chosen in the contents: the highlight stays there until the DM scrolls by hand. */
  return { hold: () => { held = true; } };
}
