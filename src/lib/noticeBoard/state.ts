/**
 * The two states a board shows the table, named once so the DM's card, its list row and the player's board all say
 * the same thing. A board is hidden, shown (players can open it) or presenting (it is open on every screen and a
 * notice can be taken); presenting implies shown, a check constraint holds it.
 */
export type NoticeBoardState = "shown" | "presenting";

export const NOTICE_BOARD_STATE_LABELS: Record<NoticeBoardState, string> = {
  shown: "Shown to players",
  presenting: "Presenting",
};

export function noticeBoardState(board: { is_revealed: boolean; presented_at: string | null }): NoticeBoardState | null {
  if (board.presented_at !== null) return "presenting";
  return board.is_revealed ? "shown" : null;
}
