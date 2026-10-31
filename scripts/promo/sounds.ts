/**
 * Naming for the recorder's Sounds tab (voice.ts): a sound effect is recorded
 * as numbered takes of one name, `dice-roll-01.wav`, `dice-roll-02.wav`, so a
 * set of variants builds up without anyone typing a file name twice.
 */

/** A take on disk: a name, a two-or-more-digit number, `.wav`. Nothing else in the folder is a sound. */
export const SOUND_FILE = /^([a-z0-9][a-z0-9-]*)-(\d{2,})\.wav$/;

/** A typed name made safe to start a file name: "Dice roll (d20)" becomes "dice-roll-d20"; nothing usable becomes "". */
export function soundSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/**
 * The file a new take of `slug` is saved as: one past the highest number that
 * name already uses, not one past the count, so deleting a middle take never
 * makes the next one overwrite the last.
 */
export function nextTakeFile(slug: string, existing: readonly string[]): string {
  let high = 0;
  for (const file of existing) {
    const m = SOUND_FILE.exec(file);
    if (m && m[1] === slug) high = Math.max(high, Number(m[2]));
  }
  return `${slug}-${String(high + 1).padStart(2, "0")}.wav`;
}
