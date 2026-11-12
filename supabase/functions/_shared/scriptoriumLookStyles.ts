/**
 * The art of each Scriptorium book look, for "Match this book's look" (illuminate-picture, #1176 story 10).
 * Kept on the server so the model only ever receives prompt text we wrote: the client names a look from this
 * fixed list and never sends words of its own. Pure, so the client can import the list through @edge-shared.
 */
export const SCRIPTORIUM_ART_LOOKS = ["grimoire", "onednd2024", "phb2014"] as const;
export type ScriptoriumArtLook = (typeof SCRIPTORIUM_ART_LOOKS)[number];

export const SCRIPTORIUM_LOOK_STYLES: Record<ScriptoriumArtLook, string> = {
  grimoire: "Warm aged parchment, deep ink browns and muted gold, painterly hand-drawn fantasy illustration.",
  onednd2024: "Clean modern fantasy book art, rich saturated colour, crisp painted detail on a light page.",
  phb2014: "Classic fantasy rulebook illustration, earthy parchment tones, traditional painted detail.",
};

/** The house line every restyle shares, so a look's descriptor sits on one steady base. */
export const SCRIPTORIUM_HOUSE_STYLE =
  "Hand-painted tabletop role-playing book art: muted, restrained colour, no cinematic gloss, no photographic look.";

export function isArtLook(value: unknown): value is ScriptoriumArtLook {
  return typeof value === "string" && (SCRIPTORIUM_ART_LOOKS as readonly string[]).includes(value);
}
