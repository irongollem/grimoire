// What an NPC's portrait is painted from: the species first, then the text model's own description.
//
// The image model sees only `true_portrait_prompt`, which the text model writes, and nothing obliges it to name the
// NPC's species there. Image models paint a human by default, so a halfling ferryman came back a tall old man (live
// run, 23 Nov 2026) though the record said halfling. The species is put in front here, in code, so the picture and the
// record cannot disagree; for the small and stocky folk an image model draws as humans it also says how they are
// built, because the word alone does not change the figure. `useNpcGeneration` paints every NPC portrait through the
// image job pipeline, so this is the one place the subject is made.

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

function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^a-z-]+/).filter((w) => w !== "");
}

/**
 * The portrait subject: "<species, with its build>. <description>". A race the record does not have (null, blank)
 * leaves the description as the model wrote it. Matched on any word of the race, so "Halfling (Lightfoot)" and
 * "Lightfoot halfling" both find the halfling build.
 *
 * With `referenced`, a picture of the species goes along as a reference (`speciesPictureFor`), and the subject says
 * what it is for: an image model given a reference otherwise copies its pose, clothes and face.
 */
export function npcPortraitSubject(race: string | null | undefined, description: string, referenced = false): string {
  const species = typeof race === "string" ? race.trim() : "";
  if (species === "") return description;
  const build = wordsOf(species).map((w) => BUILD[w]).find((b) => b !== undefined);
  const lead = build ?? article(species.toLowerCase());
  const subject = `${lead.charAt(0).toUpperCase()}${lead.slice(1)}. ${description}`;
  if (!referenced) return subject;
  return `${subject} The reference picture shows what ${article(species.toLowerCase())} looks like: take the species' build, `
    + "skin, scales, hair and features from it, and nothing else; this person's face, pose, clothing and surroundings are "
    + "as described here.";
}

/** A species row with the picture that shows it. */
export interface SpeciesPicture {
  name: string;
  image_url: string | null;
}

/**
 * The picture of the NPC's species, to send to the image model as a reference: not every species is known to it (a
 * homebrew people never is), and a name alone paints a human. The campaign's own species beat the library's (the DM's
 * homebrew is what the race means in this campaign); within each, an exact name beats one word of a longer race
 * ("Hill Dwarf" finds "Dwarf"). Only a species with a picture counts; null when none fits.
 *
 * Never for a human: every image model paints one unasked, and a reference costs input tokens on each portrait and
 * pulls the picture toward the library art's look for nothing (every library species has a picture).
 */
export function speciesPictureFor(
  race: string | null | undefined,
  campaignSpecies: readonly SpeciesPicture[],
  librarySpecies: readonly SpeciesPicture[],
): string | null {
  const wanted = typeof race === "string" ? race.trim().toLowerCase() : "";
  if (wanted === "" || /^human\b/.test(wanted)) return null;
  const words = new Set(wordsOf(wanted));
  for (const rows of [campaignSpecies, librarySpecies]) {
    const pictured = rows.filter((row): row is SpeciesPicture & { image_url: string } => !!row.image_url);
    const exact = pictured.find((row) => row.name.trim().toLowerCase() === wanted);
    if (exact) return exact.image_url;
    const byWord = pictured.find((row) => {
      const name = row.name.trim().toLowerCase();
      return name !== "" && !name.includes(" ") && words.has(name);
    });
    if (byWord) return byWord.image_url;
  }
  return null;
}
