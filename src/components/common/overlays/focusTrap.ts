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

/**
 * Wrap Tab and Shift+Tab at the panel's ends. Bind to the panel's `@keydown.tab`.
 *
 * `partner` is a region that lives outside the panel but belongs to the same job (the right-hand dock, where a card
 * opened from inside a sheet appears): Tab past the panel's last stop goes to the partner's first, and Shift+Tab
 * before the first to its last, instead of wrapping, so a keyboard user can reach it. Called with the partner as the
 * panel and the dialog's panel as the partner, it gives the way back.
 */
export function trapTab(event: KeyboardEvent, panel: HTMLElement | null, partner: HTMLElement | null = null): void {
  const items = focusablesIn(panel);
  if (!items.length) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const there = focusablesIn(partner);
  if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault();
    (there.length ? there[there.length - 1] : last).focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    (there.length ? there[0] : first).focus();
  }
}
