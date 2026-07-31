/**
 * Turning a provenance manifest record into a catalogue row.
 *
 * The manifest that the sound library is assembled from groups files the way a
 * curator thinks ("rain", "tavern", "monster"). The soundboard groups them the
 * way a mixer does (ambient bed, one-shot effect). Those are different
 * questions and neither answers the other on its own: `rain` holds both a
 * twenty-minute downpour bed and a two-second drip, and `battle` holds both a
 * looping siege ambience and a sword clash.
 *
 * So the collection is kept as-is for browsing, and the bus is decided per file
 * from collection *and* duration. Everything here is pure so the rules can be
 * argued with in tests rather than discovered after 800 files are already live.
 */

export type BoardCategory = "ambient" | "music" | "effects" | "misc";

/**
 * Collections that can yield a bed. A long file in one of these sits under a
 * scene; a long file in `foley` is still a footstep sequence, not ambience.
 */
const BED_CAPABLE_COLLECTIONS = new Set([
  "ambience",
  "desert",
  "dungeon",
  "fire",
  "forest",
  "ice",
  "night",
  "rain",
  "river",
  "tavern",
  "thunder",
  "town",
  "waves",
  "wind",
]);

/**
 * Shortest run that is worth treating as a bed rather than a one-shot.
 *
 * Twenty seconds is not arbitrary: below it a DM is going to hear the file
 * restart inside a single beat of conversation, which is what makes cheap
 * ambience sound cheap.
 */
export const BED_MIN_SECONDS = 20;

export function boardCategory(collection: string, durationSeconds: number): BoardCategory {
  if (BED_CAPABLE_COLLECTIONS.has(collection) && durationSeconds >= BED_MIN_SECONDS) {
    return "ambient";
  }
  return "effects";
}

/**
 * Theme labels per collection, matching the vocabulary encounters and
 * locations already use (`src/lib/audio/audioThemes.ts`).
 *
 * This is the whole reason the catalogue is worth shipping tagged: a DM who
 * adds the forest bed gets working location audio without tagging anything
 * themselves. An empty list means the collection has no honest single theme —
 * `foley` is a door creak and a coin purse, and inventing a theme for it would
 * make triggers fire the wrong thing, which is worse than not firing.
 */
const COLLECTION_THEMES: Readonly<Record<string, readonly string[]>> = {
  ambience: [],
  battle: ["battle"],
  desert: ["desert"],
  dungeon: ["dungeon"],
  fire: ["fire"],
  foley: [],
  forest: ["forest"],
  ice: ["arctic"],
  livestock: ["farm"],
  magic: ["magic"],
  monster: ["monster"],
  night: ["night"],
  rain: ["storm"],
  river: ["river"],
  tavern: ["tavern"],
  thunder: ["storm"],
  town: ["town"],
  waves: ["coast"],
  wildlife: ["wilderness"],
  wind: ["wind"],
};

/**
 * Tags for a catalogue row: the collection itself plus its theme labels.
 *
 * The collection is included so search finds "rain" whether the DM is thinking
 * in our groupings or in theme labels. Deduplicated because several
 * collections are their own theme.
 */
export function libraryTags(collection: string): string[] {
  const themes = COLLECTION_THEMES[collection] ?? [];
  return [...new Set([collection, ...themes])];
}

/**
 * Whether the file is authored to loop seamlessly.
 *
 * Duration cannot answer this — a forty-second field recording of a river is
 * long enough to be a bed and will still click audibly every time it wraps.
 * Only the source's own claim counts, which in practice means the uploader
 * said so in the title or filename. Everything else is reported honestly as
 * not-a-loop rather than guessed into one.
 */
export function isLoopable(slug: string, title: string): boolean {
  return /\bloop(s|ed|ing|able)?\b/i.test(`${slug} ${title}`.replace(/[-_/]/g, " "));
}

/**
 * Object key for a catalogue file.
 *
 * The `library/` prefix is what the admin-only storage policy keys off, and it
 * is deliberately not `srd/` — none of this is SRD content, and filing CC0
 * field recordings under an SRD prefix would misdescribe the licence to anyone
 * reading the bucket later.
 */
export function libraryStoragePath(slug: string): string {
  return `library/${slug}.ogg`;
}

/** Public URL for an object in a public bucket. */
export function libraryPublicUrl(supabaseUrl: string, storagePath: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/sounds/${storagePath}`;
}
