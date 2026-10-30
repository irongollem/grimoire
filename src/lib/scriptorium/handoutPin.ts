/**
 * "Pin it on a board" (#1115, frame 11b): what a handout becomes when the DM
 * hangs it on a notice board. The pin offers the handout, so taking the notice
 * gives the whole party the handout (the take rule is in the database).
 */
import { findFreeSpot } from "@/lib/noticeBoard/geometry";
import { scriptoriumLook, noticePinStyleForPaper } from "@/lib/scriptorium/looks";
import type { ScriptoriumPaper, ScriptoriumTheme } from "@/types/scriptorium.types";
import type {
  NoticeBoard,
  NoticeBoardPin,
  NoticeBoardPinInsert,
  NoticePinStyle,
} from "@/types/noticeBoard.types";

/** A handout on a paper pins as that paper's notice (a letter is sealed, a notice is a poster); a book look pins as a note. */
export function pinStyleForTheme(theme: ScriptoriumTheme): NoticePinStyle {
  return scriptoriumLook(theme).family === "paper" ? noticePinStyleForPaper(theme as ScriptoriumPaper) : "note";
}

/** The sentence under the preview: what the pin looks like, and why. */
export function describePinStyle(style: NoticePinStyle): string {
  switch (style) {
    case "letter":
      return "A letter, sealed, because the handout is a letter.";
    case "poster":
      return "A poster, because the handout is a notice.";
    case "note":
    case "image":
      return "A note, tacked up as it is.";
  }
}

/** Where a board hangs, for the picker's second line: "Hangs at the inn · shown to players". */
export function describeBoard(board: Pick<NoticeBoard, "is_revealed">, hangsAt: readonly string[]): string {
  const where = hangsAt.length ? `Hangs at ${hangsAt.join(", ")}` : "Not hung anywhere yet";
  return `${where} · ${board.is_revealed ? "shown to players" : "hidden"}`;
}

/** The row Pin it up writes, with the fields the preview draws made required. */
export type HandoutPinRow = NoticeBoardPinInsert & Required<Pick<NoticeBoardPinInsert, "size" | "seal" | "x" | "y">>;

/**
 * The pin row for this handout: up at once, at the board's emptiest free spot
 * (the helper the board editor's "Add to the board" uses), after every pin
 * already on the board in reading order.
 */
export function buildHandoutPin(input: {
  handoutId: string;
  theme: ScriptoriumTheme;
  board: Pick<NoticeBoard, "id" | "campaign_id">;
  boardPins: readonly Pick<NoticeBoardPin, "style" | "size" | "x" | "y" | "status" | "sort_order">[];
  headline: string;
}): HandoutPinRow {
  const style = pinStyleForTheme(input.theme);
  const hung = input.boardPins.filter((p) => p.status !== "draft");
  return {
    campaign_id: input.board.campaign_id,
    board_id: input.board.id,
    style,
    size: "md",
    seal: style === "letter" ? "red" : null,
    headline: input.headline.trim(),
    handout_id: input.handoutId,
    sort_order: input.boardPins.reduce((max, p) => Math.max(max, p.sort_order), 0) + 1,
    status: "up",
    ...findFreeSpot(hung, style, "md"),
  };
}
