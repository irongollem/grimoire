// Where a campaign's story begins (#1021). "We do have to be able to define somehow where a whole campaign
// starts. I'm assuming with some form of prologue quest" (maintainer, 17 Nov 2026).
//
// A campaign names its opening quest (`campaigns.opening_quest_id`). The very first sitting at the AI table begins
// there: at the place that quest's entry beat is staged, with the quest put in play at that beat, and the beat's
// read-aloud handed to the narrator as the adventure's own opening. Every later sitting picks the story up where
// it was left, so this is used once.
//
// "The very first sitting" is decided by the caller as: no turn has ever been kept at the table in this campaign.
// Not "no conversation exists": a first turn that failed leaves an empty conversation behind, and the player's
// retry must still begin at the beginning.
//
// Pure: no I/O.

/** The opening quest's entry beat, as the server read it. */
export interface Prologue {
  questId: string;
  beatId: string;
  /** The entry beat's title: the name of the scene the campaign opens on. */
  beatTitle: string;
  /** Where the entry beat is staged; null when the author staged it nowhere. */
  locationId: string | null;
  /** The beat's read-aloud as plain text; "" when it has none. */
  readAloud: string;
}

/** The read-aloud is the author's and is paid for once; long enough for a real opening, short enough not to be a chapter. */
export const READ_ALOUD_MAX = 1500;

/** Where a new conversation begins: the place the page named, else the prologue's, else nowhere in particular. */
export function startPlace(given: string | undefined, prologue: Prologue | null): string | null {
  if (given !== undefined) return given;
  return prologue === null ? null : prologue.locationId;
}

/**
 * What the narrator reads when the campaign begins, IN PLACE of the ordinary opening: the adventure's own first
 * words. It replaces rather than joins it: live, given both ("show the place in two to four sentences" and "open
 * with this text"), the narrator kept to the first and left the author's opening out. Null when there is no
 * prologue or it has no read-aloud, and then the ordinary opening is used.
 *
 * The narrator delivers the text itself. A character called through `speak` chooses its own words, so a read-aloud
 * that is someone's speech cannot be put in their mouth that way; it is narrated, quoted, with who says it.
 */
export function prologueText(prologue: Prologue | null): string | null {
  if (prologue === null) return null;
  const text = prologue.readAloud.trim();
  if (text === "") return null;
  const cut = text.length > READ_ALOUD_MAX ? `${text.slice(0, READ_ALOUD_MAX - 1).trimEnd()}…` : text;
  return (
    "The player has just sat down at the table and has not said or done anything yet. This is the very beginning " +
    `of the campaign, and the adventure opens with the scene "${prologue.beatTitle}". Its opening text is below, ` +
    "written to be read to the players. Deliver it yourself, as narration, speaking to the player as \"you\": one " +
    "sentence to set the place from what the senses take in, then the text, keeping its wording. Where it is " +
    "someone's speech, keep it as quoted speech and say who speaks. Do not call speak in this reply: a character " +
    "called that way chooses its own words. Add nothing that is not in the text or in the place, decide nothing " +
    "for the player's character, ask for no roll, and mark no quest move.\n\n" +
    cut
  );
}
