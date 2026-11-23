// What an NPC's portrait is painted from: the species first, then the text model's own description.
//
// The image model sees only `true_portrait_prompt`, which the text model writes, and nothing obliges it to name the
// NPC's species there. Image models paint a human by default, so a halfling ferryman came back a tall old man (live
// run, 23 Nov 2026) though the record said halfling. The species is put in front here, in code, so the picture and the
// record cannot disagree; for the small and stocky folk an image model draws as humans it also says how they are
// built, because the word alone does not change the figure. `useNpcGeneration` paints every NPC portrait through the
// image job pipeline (server key and own key alike), so this is the one place the subject is made.

/** Builds an image model does not infer from the name, by the word a race starts with. */
const BUILD: Record<string, string> = {
  halfling: "a halfling, one of the small folk: about three feet tall, an adult with child-sized stature, bare-footed",
  gnome: "a gnome: about three and a half feet tall, small and slight, with a large nose and bright eyes",
  dwarf: "a dwarf: about four and a half feet tall, short, broad and stocky, heavily built",
  goblin: "a goblin: about three and a half feet tall, small and wiry, with pointed ears and green-grey skin",
  kobold: "a kobold: a small reptilian humanoid about two and a half feet tall, with scales and a short snout",
};

/** "a halfling" / "an elf": the species as the subject's first words. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

/**
 * The portrait subject: "<species, with its build>. <description>". A race the record does not have (null, blank)
 * leaves the description as the model wrote it. Matched on any word of the race, so "Halfling (Lightfoot)" and
 * "Lightfoot halfling" both find the halfling build.
 */
export function npcPortraitSubject(race: string | null | undefined, description: string): string {
  const species = typeof race === "string" ? race.trim() : "";
  if (species === "") return description;
  const words = species.toLowerCase().split(/[^a-z-]+/).filter((w) => w !== "");
  const build = words.map((w) => BUILD[w]).find((b) => b !== undefined);
  const lead = build ?? article(species.toLowerCase());
  return `${lead.charAt(0).toUpperCase()}${lead.slice(1)}. ${description}`;
}
