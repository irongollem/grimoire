// What has become true of the place the party is in, and of its rooms (#1021). Pure: no I/O.
//
// A site keeps a log of what the party did there (`location_state_events`): a place is explored, cleared, looted,
// and a door is found or unlocked. Without it the Narrator describes an emptied crypt as full, or a door the party
// opened an hour ago as locked. It is per-turn state: it changes whenever the DM or the table marks something.

export const PLACE_FACTS = ["explored", "cleared", "looted"] as const;
export type PlaceFact = (typeof PLACE_FACTS)[number];
export const DOOR_FACTS = ["found", "unlocked"] as const;
export type DoorFact = (typeof DOOR_FACTS)[number];

/** A line per place or door, most that are told; a site with more reads as noise and costs every turn. */
export const SITE_LINES_MAX = 12;

export interface SiteState {
  /** The party's place and the rooms inside it (and the site it is part of, for its doors), with the facts that are true now. */
  places: { name: string; facts: PlaceFact[] }[];
  /** The doors with a true fact; `label` is what the door is called ("iron door"), empty when it has no name. */
  doors: { label: string; facts: DoorFact[] }[];
}

export const NO_SITE: SiteState = { places: [], doors: [] };

/** "the Crypt", never "the The Crypt": a name that already begins with the article keeps one. */
function withArticle(name: string): string {
  const trimmed = name.trim();
  return /^the\s/i.test(trimmed) ? `the ${trimmed.slice(4).trim()}` : `the ${trimmed}`;
}

function joined(words: string[]): string {
  return words.length <= 2 ? words.join(" and ") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The facts in their fixed order, so the sentence does not depend on the order the log answered in. */
function ordered<T extends string>(order: readonly T[], facts: readonly T[]): T[] {
  return order.filter((f) => facts.includes(f));
}

export function siteSection(state: SiteState): string {
  const clauses: string[] = [];
  for (const p of state.places) {
    const facts = ordered(PLACE_FACTS, p.facts);
    if (facts.length > 0) clauses.push(`${withArticle(p.name)} is ${joined(facts)}`);
  }
  for (const d of state.doors) {
    const facts = ordered(DOOR_FACTS, d.facts);
    if (facts.length > 0) clauses.push(`${d.label.trim() === "" ? "a door" : withArticle(d.label)} is ${joined(facts)}`);
  }
  if (clauses.length === 0) return "";
  const shown = clauses.slice(0, SITE_LINES_MAX);
  const more = clauses.length - shown.length;
  return `## Site state\n\nHere: ${shown.join("; ")}.${more > 0 ? ` And ${more} more things are marked.` : ""}`;
}
