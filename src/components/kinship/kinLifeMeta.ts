import { displayAge } from "@/lib/calendar/age";
import type { KinPerson } from "@/lib/kinship/graph";
import type { CalendarAdapter } from "@/types/calendar.types";

/** The campaign's calendar and today: what an age is measured against, wherever a person's dates are shown. */
export interface KinClock {
  adapter: CalendarAdapter;
  today: { year: number; month: number; day: number };
}

/**
 * The one place a kin person's birth and age are worked out, so the list and
 * the tree cannot disagree. The dead show their years and no age: "1428 – 1491"
 * with both, "born 1428" or "died 1491" with one. The caller adds "dead" where
 * the surface wants the word and the years do not already say it.
 */
export function kinLifeMeta(person: KinPerson, clock: KinClock): string[] {
  if (person.dead && person.diedYear !== null) {
    return [person.bornYear === null ? `died ${person.diedYear}` : `${person.bornYear} \u2013 ${person.diedYear}`];
  }
  if (person.bornYear === null) return [];
  const out = [`born ${person.bornYear}`];
  if (!person.dead) {
    const age = displayAge(clock.adapter, { born_year: person.bornYear }, clock.today);
    if (age) out.push(age);
  }
  return out;
}
