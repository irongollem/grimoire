import type { NoticeBoardPin, NoticeBoardPinUpdate, NoticePinSeal, NoticePinSize, NoticePinStyle } from "@/types/noticeBoard.types";

/**
 * The fields of a pin the editor autosaves. Position, order and status are written by the board (a drag, the list's
 * arrows, Put it up) and deliberately are not here: an autosave carrying them would put a stale spot back.
 */
export interface PinDraft {
  style: NoticePinStyle;
  headline: string | null;
  body: string | null;
  reward: string | null;
  image_url: string | null;
  seal: NoticePinSeal | null;
  size: NoticePinSize;
  quest_id: string | null;
  handout_id: string | null;
}

export function pinToDraft(pin: NoticeBoardPin): PinDraft {
  return {
    style: pin.style,
    headline: pin.headline,
    body: pin.body,
    reward: pin.reward,
    image_url: pin.image_url,
    seal: pin.seal,
    size: pin.size,
    quest_id: pin.quest_id,
    handout_id: pin.handout_id,
  };
}

/** Blank text is no text: the column is null rather than an empty string, which the player's face would draw as a gap. */
const text = (value: string | null): string | null => (value?.trim() ? value.trim() : null);

/**
 * What the draft writes. A seal belongs to a letter and nothing else, and a letter always has one, so the style
 * decides it on the way out rather than leaving a stray "red" on a note.
 */
export function draftToUpdate(draft: PinDraft): NoticeBoardPinUpdate {
  return {
    style: draft.style,
    headline: text(draft.headline),
    body: text(draft.body),
    reward: draft.style === "poster" ? text(draft.reward) : null,
    image_url: draft.style === "poster" || draft.style === "image" ? draft.image_url : null,
    seal: draft.style === "letter" ? (draft.seal ?? "red") : null,
    size: draft.size,
    quest_id: draft.quest_id,
    handout_id: draft.handout_id,
  };
}

export function draftsEqual(a: PinDraft, b: PinDraft): boolean {
  return (
    a.style === b.style &&
    text(a.headline) === text(b.headline) &&
    text(a.body) === text(b.body) &&
    text(a.reward) === text(b.reward) &&
    a.image_url === b.image_url &&
    a.seal === b.seal &&
    a.size === b.size &&
    a.quest_id === b.quest_id &&
    a.handout_id === b.handout_id
  );
}

/** Is there anything on the paper worth showing players? A blank notice is not put up by accident. */
export function hasFace(draft: PinDraft): boolean {
  return !!(text(draft.headline) ?? text(draft.body) ?? draft.image_url);
}

/** Per style: what its headline field is called and says, so the form reads like the thing being made. */
export const HEADLINE_FIELD: Record<NoticePinStyle, { label: string; placeholder: string }> = {
  note: { label: "Headline", placeholder: "LOST: one goat" },
  poster: { label: "Name", placeholder: "Grell Ashmantle" },
  letter: { label: "Addressed to", placeholder: "To the brave souls who read this" },
  image: { label: "Caption", placeholder: "The thing nailed to the tavern door" },
};

export const BODY_FIELD: Record<NoticePinStyle, { label: string; placeholder: string }> = {
  note: { label: "Note", placeholder: "Answers to Gerald. Brown, one horn, eats anything." },
  poster: { label: "The charge", placeholder: "Wanted for the burning of the miller's barn." },
  letter: { label: "Letter (read when the seal is broken)", placeholder: "The mine at Cinderfall has gone quiet." },
  image: { label: "Words beside it (read up close)", placeholder: "Anything the picture does not say." },
};
