import type { PlayerSessionLabel } from "@/types/session.types";

type Dated = Pick<PlayerSessionLabel, "started_at" | "played_on">;

/** When a player-visible session sits in the log, or null when it has no date. */
export function playerSessionWhen(row: Dated): string | null {
  return row.started_at ?? row.played_on;
}

/** "4 Oct", or null when the session has no date. */
export function formatSessionShortDay(row: Dated): string | null {
  // A date-only column parsed as UTC midnight can slip a day west of UTC, so
  // read it as a local calendar date.
  const date = row.started_at
    ? new Date(row.started_at)
    : row.played_on
      ? new Date(`${row.played_on}T12:00:00`)
      : null;
  return date ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
}
