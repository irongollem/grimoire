// The notice board (#1064): a board of pins the DM puts up in a campaign, which players read and, while the DM presents
// it, take. Rows mirror migration 20261015234112_notice_boards.sql; the player shapes mirror get_player_notice_boards.

export const NOTICE_BOARD_SURFACES = ["cork", "planks"] as const;
/** cork (city, tavern) hangs in an oak frame; planks (frontier, outpost) in a pine one. */
export type NoticeBoardSurface = (typeof NOTICE_BOARD_SURFACES)[number];

export const NOTICE_PIN_STYLES = ["note", "poster", "letter", "image"] as const;
export type NoticePinStyle = (typeof NOTICE_PIN_STYLES)[number];

export const NOTICE_PIN_SIZES = ["sm", "md", "lg"] as const;
export type NoticePinSize = (typeof NOTICE_PIN_SIZES)[number];

/** draft: off the board, unseen; up: on the board; taken: torn down by a player, leaving its stub. */
export type NoticePinStatus = "draft" | "up" | "taken";

export const NOTICE_PIN_SEALS = ["red", "black"] as const;
export type NoticePinSeal = (typeof NOTICE_PIN_SEALS)[number];

export interface NoticeBoard {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  surface: NoticeBoardSurface;
  is_revealed: boolean;
  /** Set while the DM presents the board; taking a notice works only then. */
  presented_at: string | null;
  created_at: string;
  updated_at: string;
}

export type NoticeBoardInsert = Pick<NoticeBoard, "campaign_id" | "name"> & Partial<Pick<NoticeBoard, "surface">>;
export type NoticeBoardUpdate = Partial<Pick<NoticeBoard, "name" | "surface" | "is_revealed" | "presented_at">>;

export interface NoticeBoardPin {
  id: string;
  user_id: string;
  campaign_id: string;
  board_id: string;
  style: NoticePinStyle;
  /** A poster's subject, a letter's addressee, a note's first line. */
  headline: string | null;
  /** The hand-written text. */
  body: string | null;
  /** A poster's bounty. */
  reward: string | null;
  /** A pinned picture, or a wanted poster's portrait (copied from the NPC or monster when picked). */
  image_url: string | null;
  seal: NoticePinSeal | null;
  size: NoticePinSize;
  /** Position as a fraction (0..1) of the board's width and height. */
  x: number;
  y: number;
  sort_order: number;
  status: NoticePinStatus;
  quest_id: string | null;
  handout_id: string | null;
  taken_by: string | null;
  taken_at: string | null;
  taken_session_number: number | null;
  created_at: string;
  updated_at: string;
}

export type NoticeBoardPinInsert = Pick<NoticeBoardPin, "campaign_id" | "board_id" | "style"> &
  Partial<
    Pick<
      NoticeBoardPin,
      "headline" | "body" | "reward" | "image_url" | "seal" | "size" | "x" | "y" | "sort_order" | "status" | "quest_id" | "handout_id"
    >
  >;
export type NoticeBoardPinUpdate = Partial<
  Pick<
    NoticeBoardPin,
    | "style"
    | "headline"
    | "body"
    | "reward"
    | "image_url"
    | "seal"
    | "size"
    | "x"
    | "y"
    | "sort_order"
    | "status"
    | "quest_id"
    | "handout_id"
    | "taken_by"
    | "taken_at"
    | "taken_session_number"
  >
>;

/**
 * What the board renderer draws for one pin: its face and its place, the same for the DM's editor and the player's
 * view. Built from a NoticeBoardPin (DM) or a PlayerNoticePin (player).
 */
export interface NoticePinFace {
  id: string;
  style: NoticePinStyle;
  headline: string | null;
  body: string | null;
  reward: string | null;
  image_url: string | null;
  seal: NoticePinSeal | null;
  size: NoticePinSize;
  x: number;
  y: number;
  status: NoticePinStatus;
  /** Who took it, for the stub ("Taken by Aria, session 12"). */
  taken_by_name: string | null;
  taken_session_number: number | null;
}

/** One pin as get_player_notice_boards returns it: the face, and the quest and handout only once taken. */
export interface PlayerNoticePin extends NoticePinFace {
  status: "up" | "taken";
  sort_order: number;
  updated_at: string;
  /** That the notice offers something to take, never what, until it is taken. */
  offers: boolean;
  taken_at: string | null;
  quest_id: string | null;
  handout_id: string | null;
}

export interface PlayerNoticeBoard {
  id: string;
  name: string;
  surface: NoticeBoardSurface;
  presented_at: string | null;
  /** The last change a player can see: the board appearing, or a notice going up, being edited or taken. Not the board
   * row's own stamp, which presenting moves; this is what the unread dot compares against. */
  updated_at: string;
  /** Places the board hangs at (location_placements), for the player's place panel. */
  location_ids: string[];
  pins: PlayerNoticePin[];
}

/** take_notice_board_pin's answer. Losing a race is an answer, not an error: the handout opens all the same. */
export interface TakeNoticeResult {
  outcome: "taken" | "already_taken";
  taken_by_name: string | null;
  quest_id: string | null;
  handout_id: string | null;
}
