/** Query root of the quest board's one server read. Its own root, not a branch of
 *  `quest_beats`: beat, route, attachment, consequence, objective and runtime
 *  writes all change it, and none of their keys prefix-match a branch of another.
 *  Kept apart from `board.ts` so a mutation hook can name it without importing
 *  the board's rules. */
export const QUEST_BOARD_KEY = "quest_board";
