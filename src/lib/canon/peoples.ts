/**
 * The peoples of the world (#1255 item 30): who lives in it, as shares of the population, so a person the generator
 * invents is rolled at the world's odds instead of defaulting to a human. Stored in `campaigns.peoples`; the table's
 * check (`campaigns_peoples_valid`) refuses what {@link peoplesProblem} names, so the screen can say it first.
 */
import { peoplesLine as formatPeoples, type People } from "@edge-shared/worldBlock.ts";

export type { People };
/** The list as words for a prompt: the one formatter the server's world block uses too. */
export const peoplesLine = formatPeoples;

export const MAX_PEOPLES = 40;
export const MAX_PEOPLE_NAME = 60;

const key = (name: string): string => name.trim().toLowerCase();

export function peoplesTotal(list: readonly People[]): number {
  return Math.round(list.reduce((sum, p) => sum + p.percent, 0) * 100) / 100;
}

/** A plain sentence for the first thing the table would refuse, or null when the list can be saved. */
export function peoplesProblem(list: readonly People[]): string | null {
  if (list.length > MAX_PEOPLES) return `A world can list at most ${MAX_PEOPLES} peoples.`;
  const seen = new Set<string>();
  for (const p of list) {
    const name = p.name.trim();
    if (name === "") return "Every people needs a name.";
    if (name.length > MAX_PEOPLE_NAME) return `A name can be at most ${MAX_PEOPLE_NAME} characters: "${name.slice(0, 20)}…".`;
    if (!Number.isFinite(p.percent) || p.percent < 0 || p.percent > 100) return `${name}'s share must be between 0 and 100.`;
    if (seen.has(key(name))) return `${name} is listed twice.`;
    seen.add(key(name));
  }
  const total = peoplesTotal(list);
  if (total > 100) return `The shares add up to ${total}%, which is more than the whole population.`;
  return null;
}

/**
 * Rolls who a made-up person is: each people at its share, the rest up to 100 as `null` ("anyone else", a people the
 * DM did not list). An empty list is null. The random source is an argument so a test can pin it.
 */
export function rollPeople(list: readonly People[], random: () => number = Math.random): string | null {
  const point = random() * 100;
  let edge = 0;
  for (const p of list) {
    edge += p.percent;
    if (point < edge) return p.name;
  }
  return null;
}
