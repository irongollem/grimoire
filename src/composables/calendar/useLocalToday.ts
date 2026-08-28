import { computed, type ComputedRef } from "vue";
import { useNow } from "@vueuse/core";

/** "YYYY-MM-DD" in the user's local timezone (NOT UTC — see useLocalToday). */
export function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Reactive local calendar date for comparing against date-only columns like
 * session_proposals.proposed_date.
 *
 * Exists because `new Date().toISOString().slice(0, 10)` — the pattern this
 * replaces — was wrong twice over for that comparison: it was captured once
 * at component setup (an installed PWA keeps components alive for days, so
 * "today" went stale and past session dates kept showing), and it is UTC (for
 * timezones ahead of UTC, yesterday still counts as today until small hours).
 * This version ticks across midnight and uses the local calendar.
 */
export function useLocalToday(): ComputedRef<string> {
  const now = useNow({ interval: 60_000 });
  return computed(() => localDateString(now.value));
}
