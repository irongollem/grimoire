// Which focused element a canvas keyboard shortcut must leave alone.

/** Elements that act on Space themselves when focused from the keyboard; the Space hand leaves them alone. */
const SPACE_CONTROLS =
  "button, a[href], select, summary, [role=button], [role=checkbox], [role=switch], [role=tab], [role=radio], [role=menuitem], [role=option]";

/** Focus is in an input, textarea or contenteditable: every key is the field's. */
export function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true);
}

function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    // An engine (or test DOM) that does not know the pseudo-class: treat the
    // control as mouse-focused rather than throwing out of a keydown handler.
    return false;
  }
}

/**
 * Whether the focused element needs Space itself: typing, or a control a
 * keyboard user has tabbed to (a rail button, a checkbox), which answers Space
 * by activating. One merely clicked with the mouse keeps focus without
 * `:focus-visible`, and there Space pans: picking a tool on the rail and then
 * Space-dragging must just work.
 */
export function targetKeepsSpace(target: EventTarget | null): boolean {
  if (isTextEntry(target)) return true;
  const el = target as HTMLElement | null;
  const control = el?.closest?.(SPACE_CONTROLS);
  return !!control && isFocusVisible(control);
}
