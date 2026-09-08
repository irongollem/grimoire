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
 * which was never what "Back to story flow" or "Back to the session" meant.
 * Every link into a beat page says which of the quest's three permanent tabs
 * it left, via `?view=`.
 */
export function questSurfaceReturnTo(questId: string, beatId: string, surface: "work" | "run"): string {
  return `/quests/${questId}?view=${surface}&beat=${beatId}`;
}

/** The label of the beat page's back button, read off where it goes. */
export function questReturnLabel(returnTo: string): string {
  return /[?&]view=run(&|$)/.test(returnTo) ? "Back to the session" : "Back to story flow";
}
