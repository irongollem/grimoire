/**
 * Keyboard behaviour of a WAI-ARIA tab list (automatic activation): Left and
 * Right move to the previous/next tab and wrap, Home and End jump to the
 * ends. The new tab is selected and focused; Tab then leaves the list for the
 * panel, because only the selected tab is in the tab order (roving
 * tabindex: the caller gives it tabindex 0 and the others -1).
 *
 * Returns the index to select, or null when the key is not a tab-list key.
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** Focus the tab at `index` inside the tab list that contains `from`. */
export function focusTab(from: EventTarget | null, index: number): void {
  const list = (from as HTMLElement | null)?.closest('[role="tablist"]');
  const tabs = list?.querySelectorAll<HTMLElement>('[role="tab"]');
  tabs?.[index]?.focus();
}
