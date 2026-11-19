/**
 * Whether a helper (someone with the party whom the rules cannot play) takes a turn of their own this round, for a
 * player who chose the quiet way (`useTableHelpers`; by default a helper acts every round).
 *
 * Their turn is a turn of the story: a model call, several seconds and a credit. Seen in play: Sister Folio "kept
 * her hands folded" for a credit every round of a ten-round fight. The quiet way has a helper act when there is
 * something new for them to act on, and otherwise lets the moment pass in silence:
 *   - the first time their turn comes round (they see the fight break out);
 *   - when they were hurt since their last turn;
 *   - when the played character has gone down or got back up since;
 *   - when the player has said something aloud since, which may have been meant for them.
 */
export interface HelperSeen {
  /** The helper's hit points when their turn last came round; null when it never has. */
  hp: number | null;
  /** Whether the played character was down then. */
  playedDown: boolean;
  /** How many lines the player had said aloud in this fight by then. */
  said: number;
}

export const NEVER_SEEN: HelperSeen = { hp: null, playedDown: false, said: 0 };

export function helperActs(now: { hp: number; playedDown: boolean; said: number }, last: HelperSeen): boolean {
  if (last.hp === null) return true;
  if (now.hp < last.hp) return true;
  if (now.playedDown !== last.playedDown) return true;
  return now.said > last.said;
}

/** Whether a helper takes a turn of the story now: every round, unless the player chose the quiet way. */
export function helperTakesTurn(quiet: boolean, now: { hp: number; playedDown: boolean; said: number }, last: HelperSeen): boolean {
  return !quiet || helperActs(now, last);
}
