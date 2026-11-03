/**
 * When each Reel goes out. Instagram's API publishes the moment it is called
 * and has no "post at this time", so the schedule lives here
 * (`scripts/promo/schedule.json`) and a launchd job on the maintainer's Mac
 * runs `promo:post -- --due` every hour, one Reel per run.
 *
 * The times are picked for the audience (most of it in the US), so a Reel
 * that would go out more than LATE_LIMIT_HOURS late, because the Mac was
 * asleep, does not: it and every Reel after it move back by whole days to the
 * same time of day, keeping the rhythm instead of posting at 2am in New York.
 */

export const LATE_LIMIT_HOURS = 3;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface ScheduleEntry {
  id: string;
  /** ISO 8601 with an explicit offset, e.g. 2026-11-04T18:00:00+01:00. */
  at: string;
}

/** Reads schedule.json, refusing anything ambiguous: a time without an offset is read in whatever zone the job runs in. */
export function parseSchedule(json: unknown): ScheduleEntry[] {
  if (!Array.isArray(json)) throw new Error("schedule.json must be a list of { id, at }");
  const seen = new Set<string>();
  return json.map((raw: unknown, i) => {
    const e = raw as Partial<ScheduleEntry>;
    if (typeof e.id !== "string" || typeof e.at !== "string") throw new Error(`schedule entry ${i + 1} needs an id and an at`);
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(e.at) || Number.isNaN(Date.parse(e.at))) {
      throw new Error(`${e.id}: "${e.at}" is not a time with an offset (write 2026-11-04T18:00:00+01:00)`);
    }
    if (seen.has(e.id)) throw new Error(`${e.id} is scheduled twice`);
    seen.add(e.id);
    return { id: e.id, at: e.at };
  });
}

/** The one Reel to post now: the earliest unposted one whose time has come, within the late limit. */
export function nextDue(entries: ScheduleEntry[], posted: ReadonlySet<string>, now: Date): ScheduleEntry | null {
  const t = now.getTime();
  const due = entries.filter((e) => !posted.has(e.id) && Date.parse(e.at) <= t && t - Date.parse(e.at) <= LATE_LIMIT_HOURS * HOUR);
  due.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return due[0] ?? null;
}

/** Writes `ms` back as ISO with the same offset `like` carries, so the file keeps reading in the maintainer's own time. */
function withOffsetOf(like: string, ms: number): string {
  const m = /(Z|([+-])(\d{2}):(\d{2}))$/.exec(like) as RegExpExecArray;
  const offsetMin = m[1] === "Z" ? 0 : (m[2] === "-" ? -1 : 1) * (Number(m[3]) * 60 + Number(m[4]));
  const local = new Date(ms + offsetMin * 60_000).toISOString().slice(0, 19);
  return local + (m[1] === "Z" ? "Z" : m[1]);
}

/**
 * When the earliest unposted Reel is past the late limit, moves it and every
 * unposted Reel after it back by the same whole number of days, until it is in
 * the future again. Returns the new schedule and how many days it moved, or
 * null when nothing was missed. Posted Reels never move.
 */
export function pushMissed(entries: ScheduleEntry[], posted: ReadonlySet<string>, now: Date): { entries: ScheduleEntry[]; days: number } | null {
  const t = now.getTime();
  const open = entries.filter((e) => !posted.has(e.id)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const first = open[0];
  if (!first || t - Date.parse(first.at) <= LATE_LIMIT_HOURS * HOUR) return null;
  const days = Math.ceil((t - Date.parse(first.at)) / DAY);
  const moved = new Set(open.map((e) => e.id));
  return {
    days,
    entries: entries.map((e) => (moved.has(e.id) ? { id: e.id, at: withOffsetOf(e.at, Date.parse(e.at) + days * DAY) } : e)),
  };
}
