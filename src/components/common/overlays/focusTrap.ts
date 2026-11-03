// Keeping Tab inside a teleported panel. A panel teleported to `body` has no ancestor to contain Tab: left alone,
// tabbing out of the last control walks into the page behind the backdrop, where every stop is invisible.
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function focusablesIn(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // `offsetParent` is null for anything `display:none` (a collapsed section, an inactive tab panel), which must not become a Tab stop.
    (el) => el.offsetParent !== null,
  );
}

/** Wrap Tab and Shift+Tab at the panel's ends. Bind to the panel's `@keydown.tab`. */
export function trapTab(event: KeyboardEvent, panel: HTMLElement | null): void {
  const items = focusablesIn(panel);
  if (!items.length) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
