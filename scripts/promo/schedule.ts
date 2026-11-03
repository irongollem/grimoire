/**
 * When each Reel goes out. Instagram's API publishes the moment it is called
 * and has no "post at this time", so the schedule lives here
 * (`scripts/promo/schedule.json`) and a launchd job on the maintainer's Mac
 * runs `promo:post -- --due` every hour. A Mac asleep at the planned time
 * posts on waking, one Reel per run, so a few missed days never land as a
 * burst of posts in one minute.
 */

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

/** The one Reel to post now: the earliest whose time has come and that is not posted yet. */
export function nextDue(entries: ScheduleEntry[], posted: ReadonlySet<string>, now: Date): ScheduleEntry | null {
  const due = entries.filter((e) => !posted.has(e.id) && Date.parse(e.at) <= now.getTime());
  due.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return due[0] ?? null;
}
