import type { NoticeBoardPin, NoticePinFace, NoticePinStyle } from "@/types/noticeBoard.types";

/** What the renderer draws for a DM's pin. The taker's name is looked up by the caller (a character, a member). */
export function toPinFace(pin: NoticeBoardPin, takerName: string | null): NoticePinFace {
  return {
    id: pin.id,
    style: pin.style,
    headline: pin.headline,
    body: pin.body,
    reward: pin.reward,
    image_url: pin.image_url,
    seal: pin.seal,
    size: pin.size,
    x: pin.x,
    y: pin.y,
    status: pin.status,
    taken_by_name: takerName,
    taken_session_number: pin.taken_session_number,
  };
}

export const STYLE_LABELS: Record<NoticePinStyle, string> = {
  note: "Note",
  poster: "Wanted poster",
  letter: "Letter",
  image: "Picture",
};

/** The accessible name of a pin's button: what it is, then what it says. */
export function pinLabel(face: Pick<NoticePinFace, "style" | "headline">): string {
  const headline = face.headline?.trim();
  return headline ? `${STYLE_LABELS[face.style]}: ${headline}` : STYLE_LABELS[face.style];
}

const UNNAMED: Record<NoticePinStyle, string> = {
  note: "a notice",
  poster: "a wanted poster",
  letter: "a sealed letter",
  image: "a picture",
};

/**
 * A pin as it reads inside a sentence ("Aria took {phrase}."): a poster names who is wanted, anything else quotes its
 * first line. pinLabel is the list form ("Wanted poster: Grell"), which reads wrong mid-sentence.
 */
export function noticePhrase(face: Pick<NoticePinFace, "style" | "headline">): string {
  const headline = face.headline?.trim();
  if (!headline) return UNNAMED[face.style];
  return face.style === "poster" ? `the wanted poster for ${headline}` : `“${headline}”`;
}

/** What a stub says when tapped: "Taken by Aria, session 12". No taker is "Taken", and a missing session is simply left out. */
export function stubLabel(face: Pick<NoticePinFace, "taken_by_name" | "taken_session_number">): string {
  const name = face.taken_by_name?.trim();
  if (!name) return "Taken";
  return face.taken_session_number === null ? `Taken by ${name}` : `Taken by ${name}, session ${face.taken_session_number}`;
}
