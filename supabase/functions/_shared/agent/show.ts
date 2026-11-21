// Putting something in front of the player (#1021): a handout the campaign prepared, the picture of someone or
// something the party is looking at, or a place the story hands over (with its map when the story gives the map). A Dungeon Master at a table slides a letter across or holds up a picture;
// the narrator does it with one tool, and the page draws it in the story where it happened.
//
// A handout is given for real (the campaign's own sharing, `share_handout`), so it is in the player's handouts
// from then on; it is given when the turn is kept, like anything else that changes hands. A picture is only shown:
// it is the campaign's own art for that record, never one the model names or makes. A place is shared like a
// handout, when the turn is kept: the played character is shown it (the campaign's own sharing, `reveals.ts`), and a
// place's Book Nook comes with that, since the player's read of a nook asks only whether the place is theirs.

import type { AgentTool } from "./types.ts";
import type { Parsed } from "./parse.ts";
import { isRecord, refuse, UUID_RE } from "./parse.ts";

/** What the page draws, kept on the stored tool result so a reopened sitting shows it again. */
export type Shown =
  | { kind: "handout"; id: string; title: string }
  | { kind: "picture"; of: PictureOf; title: string; url: string }
  | { kind: "place"; id: string; title: string; url: string | null; hasMap: boolean; hasNook: boolean };

export type PictureOf = "person" | "item" | "creature";

/** A place as the Narrator may hand it over: what the campaign holds of it, read for the caller. */
export interface PlaceCard {
  title: string;
  /** The place's own picture; null when it has none. */
  url: string | null;
  /** The place has a map (a scan, a drawing or a site's bake) to hand over. */
  hasMapPicture: boolean;
  /** The DM already shares that map with the party. */
  mapShared: boolean;
  hasNook: boolean;
}

/** What a kept turn shares of a place: the place itself, and its map only when the story handed the map over. */
export interface PlaceShare {
  id: string;
  withMap: boolean;
}

/** A handout of the campaign's the played character does not hold yet. */
export interface HandoutOffer {
  id: string;
  title: string;
}

export const SHOW_TOOL_NAME = "show";
export const MAX_HANDOUTS_SHOWN = 12;
/** Pictures and handouts in one reply: a page of pictures is not a story. */
export const SHOWN_PER_TURN = 3;

export const SHOW_TOOL: AgentTool = {
  name: SHOW_TOOL_NAME,
  description:
    "Puts something in front of the player, the way a Dungeon Master slides a letter across the table or holds up a " +
    "picture. Give exactly one id. handout_id: a handout listed under \"Handouts the campaign prepared\"; it is then " +
    "the player's to read and keep, so give it when the story hands it over (a letter opened, a notice read, a page " +
    "torn from a ledger), never before. person_id, item_id or creature_id: shows the campaign's own picture " +
    "of that record, when it has one; use it the first time the player sees someone or something worth seeing, not " +
    "every turn. place_id: the character now knows that place (it joins their places, with its picture and its nook " +
    "when it has them). Add with_map true only when the story hands over the map itself (a map found, drawn or " +
    "given); without it the map stays as the Dungeon Master left it. It shows only what the campaign has: you cannot " +
    "describe or request a picture.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      handout_id: { type: "string", description: "The id of a prepared handout, as listed." },
      person_id: { type: "string", description: "The id of a character of this campaign." },
      place_id: { type: "string", description: "The id of a place of this campaign." },
      item_id: { type: "string", description: "The id of an item, as search or get returned it." },
      creature_id: { type: "string", description: "The id of a monster, as search or get returned it." },
      with_map: { type: "boolean", description: "Only with place_id: true when the story hands over the place's map. Leave it out otherwise." },
    },
  },
};

/** A shared library id is text ("srd_owlbear"): letters, digits, dashes and underscores. */
const LIBRARY_ID = /^[A-Za-z0-9_-]{2,120}$/;

export type ShowAsk = { what: "handout"; id: string } | { what: PictureOf; id: string } | { what: "place"; id: string; withMap?: true };

const KEYS: Array<[key: string, what: ShowAsk["what"]]> = [
  ["handout_id", "handout"],
  ["person_id", "person"],
  ["place_id", "place"],
  ["item_id", "item"],
  ["creature_id", "creature"],
];

/** What the narrator asked to show. Exactly one id; an item or a creature may be a shared library record. */
export function parseShow(input: Record<string, unknown>): Parsed<ShowAsk> {
  const given = KEYS.filter(([key]) => input[key] !== undefined);
  if (given.length !== 1) return refuse("Give exactly one of handout_id, person_id, place_id, item_id or creature_id.");
  const [key, what] = given[0];
  if (input.with_map !== undefined && what !== "place") return refuse("with_map goes only with place_id.");
  if (input.with_map !== undefined && typeof input.with_map !== "boolean") return refuse("with_map must be true or false.");
  const id = input[key];
  if (typeof id !== "string") return refuse(`${key} must be an id.`);
  const library = (what === "item" || what === "creature") && LIBRARY_ID.test(id);
  if (!UUID_RE.test(id) && !library) return refuse(`${key} must be the record's id, as it was listed or as search or get returned it.`);
  if (what === "place" && input.with_map === true) return { ok: true, value: { what, id, withMap: true } };
  return { ok: true, value: { what, id } };
}

/** The handout asked for, when it is one the campaign prepared and the player does not hold yet. */
export function offeredHandout(offers: readonly HandoutOffer[], id: string): HandoutOffer | null {
  return offers.slice(0, MAX_HANDOUTS_SHOWN).find((h) => h.id === id) ?? null;
}

/** A picture's address as the page may draw it: the campaign's own stored art, over https. Anything else is not shown. */
export function pictureUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(url) || /^http:\/\/(127\.0\.0\.1|localhost)[:/][^\s"'<>]*$/i.test(url) ? url : null;
}

/** The part of the turn's state that lists the handouts still to be handed over. Empty when there are none. */
export function handoutsSection(offers: readonly HandoutOffer[]): string {
  if (offers.length === 0) return "";
  const lines = [
    "## Handouts the campaign prepared",
    "Papers the player can hold and read: letters, notices, pages. Each is handed over when the story reaches it, with show and its handout_id, and never before. What a handout says is for the player to read, not for you to retell.",
    ...offers.slice(0, MAX_HANDOUTS_SHOWN).map((h) => `- "${h.title}" [handout_id ${h.id}]`),
  ];
  if (offers.length > MAX_HANDOUTS_SHOWN) lines.push(`- and ${offers.length - MAX_HANDOUTS_SHOWN} more`);
  return lines.join("\n");
}

/** What the narrator is told once something is shown. */
export function shownText(shown: Shown): string {
  if (shown.kind === "handout") {
    return `When this turn is kept, the player holds the handout "${shown.title}" and can read it. Say in a sentence how it comes into their hands; do not retell what it says.`;
  }
  if (shown.kind === "place") {
    const held = shown.hasMap ? " and holds its map" : "";
    return `When this turn is kept, the character knows ${shown.title}${held}, and it is among their places. Go on with the story; do not describe the map or the picture itself.`;
  }
  return `The player is now looking at the picture of ${shown.title}. Go on with the story; do not describe the picture itself.`;
}

/** A stored `shown` read back: jsonb is untrusted, and a picture's address goes into an image. */
export function asShown(raw: unknown): Shown | null {
  if (!isRecord(raw) || typeof raw.title !== "string" || raw.title.trim() === "") return null;
  if (raw.kind === "handout") return typeof raw.id === "string" && UUID_RE.test(raw.id) ? { kind: "handout", id: raw.id, title: raw.title } : null;
  if (raw.kind === "place") {
    if (typeof raw.id !== "string" || !UUID_RE.test(raw.id)) return null;
    const url = raw.url === null ? null : pictureUrl(raw.url);
    if (raw.url !== null && url === null) return null;
    return { kind: "place", id: raw.id, title: raw.title, url, hasMap: raw.hasMap === true, hasNook: raw.hasNook === true };
  }
  if (raw.kind === "picture") {
    const url = pictureUrl(raw.url);
    const of = raw.of === "person" || raw.of === "item" || raw.of === "creature" ? raw.of : null;
    return url !== null && of !== null ? { kind: "picture", of, title: raw.title, url } : null;
  }
  return null;
}
