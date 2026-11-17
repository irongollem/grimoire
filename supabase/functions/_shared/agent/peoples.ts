// The peoples of the campaign's world, as everyone in it knows them (#1021).
//
// A world has kinds of folk of its own ("a marrow", "the sugarspun"), and a model has never heard of them. Seen
// live: the player said "I am not sure what this marrow is truly up to, he never even told me his name", and the
// character answered about someone called Marrow. So the narrator and every character are told the names of the
// world's peoples, and that they are kinds of folk. Names only: what a people is like is the campaign's to tell,
// through what a character's own record says and what the narrator looks up.
//
// Pure: no I/O.

export const MAX_PEOPLES = 40;

/** The names as they are told: trimmed, once each (whatever the capitals), at most `MAX_PEOPLES`. */
export function peopleNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (name === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === MAX_PEOPLES) break;
  }
  return out;
}

/** The section of a prompt that names the world's peoples; empty when the campaign has none of its own. */
export function peoplesSection(names: readonly string[]): string {
  const told = peopleNames(names);
  if (told.length === 0) return "";
  return (
    `The peoples of this world: ${told.join(", ")}. Everyone here knows these words. Each is a kind of folk, ` +
    "as elf or dwarf is, however it is written: \"a marrow\" or \"this Marrow\" is one of that people, never somebody's name. " +
    "Someone called by their people alone is someone whose name the speaker does not know."
  );
}
