export function safeQuestReturnTo(value: unknown, fallback: string) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : fallback;
}

export function withQuestReturnTo(path: string, returnTo: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * Where a beat page sends the DM back to. A quest URL with only `?beat=` names
 * no surface, and `useQuestDetailSurface` then falls back to the overview —
 * which is a modal over the quest list, so "Back to story flow" dropped the DM
 * onto the list with a popover open (the very navigation the in-quest rule
 * forbids). Every link into a beat page says which surface it left.
 */
export function questSurfaceReturnTo(questId: string, beatId: string, surface: "work" | "run"): string {
  return surface === "run"
    ? `/quests/${questId}?mode=run&beat=${beatId}`
    : `/quests/${questId}?view=work&beat=${beatId}`;
}

/** The label of the beat page's back button, read off where it goes. */
export function questReturnLabel(returnTo: string): string {
  return /[?&]mode=run(&|$)/.test(returnTo) ? "Back to the session" : "Back to story flow";
}
