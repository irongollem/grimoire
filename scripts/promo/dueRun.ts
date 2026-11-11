/**
 * The hourly posting job's one run (`promo:post -- --due`), with its effects
 * passed in so the order of things can be tested.
 *
 * Two jobs share the run: posting whatever is due, and the stats snapshot a
 * post needs when it turns one day old (stats.ts). The snapshot is decided up
 * front and taken on every path out: when nothing is due, when the queue had
 * to move back, and after a post that failed. Each of those used to return or
 * throw before it, and a missed day mark is never taken again (the next run
 * is an hour later, outside the mark).
 */
import { LATE_LIMIT_HOURS, nextDue, pushMissed, type ScheduleEntry } from "./schedule";

export interface DueRun {
  now: Date;
  schedule: ScheduleEntry[];
  /** Ids already posted. */
  posted: ReadonlySet<string>;
  /** Whether some post is at its one-day mark (stats.ts dayMarkDue). */
  dayMark: boolean;
  log(line: string): void;
  notify(title: string, message: string): void;
  writeSchedule(entries: ScheduleEntry[]): void;
  /** Resolves once Instagram answers; throws when the network never came back. */
  networkUp(): Promise<void>;
  post(id: string): Promise<{ permalink: string }>;
  /** Takes the stats snapshot; never throws (a failed read is logged, the run's job is posting). */
  snapshot(): Promise<void>;
}

export async function runDue(r: DueRun): Promise<void> {
  const stamp = r.now.toISOString();
  const missed = pushMissed(r.schedule, r.posted, r.now);
  if (missed) {
    r.writeSchedule(missed.entries);
    const days = missed.days === 1 ? "a day" : `${missed.days} days`;
    r.log(`${stamp} missed a slot by more than ${LATE_LIMIT_HOURS} hours; moved the queue back ${days}`);
    r.notify("Grimoire posts moved", `A post missed its time (the Mac was off or asleep). The queue moved back ${days}.`);
    if (r.dayMark) await r.snapshot();
    return;
  }
  const due = nextDue(r.schedule, r.posted, r.now);
  if (!due) {
    r.log(`${stamp} nothing due`);
    if (r.dayMark) await r.snapshot();
    return;
  }
  r.log(`${stamp} posting ${due.id}, planned for ${due.at}`);
  try {
    await r.networkUp();
    const record = await r.post(due.id);
    r.notify("Grimoire post published", `${due.id}: ${record.permalink}`);
  } catch (e) {
    r.notify("Grimoire post NOT published", `${due.id}: ${e instanceof Error ? e.message : String(e)}`);
    // Last night's post may be at its day mark on this very run.
    if (r.dayMark) await r.snapshot();
    throw e;
  }
  await r.snapshot();
}
