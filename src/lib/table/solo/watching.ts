/**
 * Whether the characters go on talking while the player watches (#1021).
 *
 * The server says when a turn ended with the floor still the characters' (`floor: "characters"`: they were in the
 * middle of a conversation among themselves and nothing waits on the player). The page may then let them go on
 * without the player saying anything. Each such turn is a turn of the story and costs what one costs, so it
 * happens only when the player wants it, a few times in a row at most, and never over something the player has
 * started to write.
 */
export const MAX_WATCHED_IN_A_ROW = 3;

export function goesOnByItself(input: {
  /** The server's word on the floor as the turn ended. */
  floor: "characters" | "player";
  /** The player lets conversations run on (their own switch). */
  wanted: boolean;
  /** How many turns in a row the characters have already gone on without the player. */
  watched: number;
  /** A fight is on the board, a roll is asked for, or the player has left: the turn is not the characters' to take. */
  busy: boolean;
  /** The player has something in the composer. */
  writing: boolean;
}): boolean {
  if (input.floor !== "characters" || !input.wanted || input.busy || input.writing) return false;
  return input.watched < MAX_WATCHED_IN_A_ROW;
}
