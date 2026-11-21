// What play reveals (#1021). "As you move through the story things should be revealed to you. Your journal, bestiary
// and people should slowly fill with details" (maintainer, 17 Nov 2026).
//
// The AI table writes no reveal store of its own. The campaign already records what a character has been shown:
// a place or a person is shown to the party members in its `player_visible_to`, and the place's own description
// reaches them once `is_description_shared` is set (the player view strips the DM's secret blocks from it). Those are
// the switches a DM flips by hand; here play flips them, for the character being played and nobody else:
//
//   - the place the party stands in is shown to that character, with its description;
//   - a recorded person who spoke or acted in front of them is shown to that character.
//
// Three rules:
//   1. Only the played character. A sitting without one reveals nothing, and no other party member is added: in a
//      campaign with other players, they learn it when their own character is there.
//   2. Only ever more. Nothing is taken out of a list, and a description that is shared stays shared.
//   3. Only with the kept turn, like every other write a turn makes.
//
// What a person is shown AS is not decided here: the player view shows a disguised character under its cover.
//
// Pure: no I/O.

/** A place or a person as the campaign holds it: who it is already shown to. */
export interface Shown {
  id: string;
  visibleTo: readonly string[];
}

export interface PlaceShown extends Shown {
  descriptionShared: boolean;
}

/** The writes a kept turn makes: each one a row to update with its whole new list. Empty when nothing is new. */
export interface RevealPlan {
  place: { id: string; visibleTo: string[]; shareDescription: boolean } | null;
  characters: { id: string; visibleTo: string[] }[];
}

const withMember = (list: readonly string[], memberId: string): string[] | null =>
  list.includes(memberId) ? null : [...list, memberId];

/**
 * What to write so the played character has seen the place they stand in and the people who spoke to them.
 * A row that already shows them what it should is left out, so a turn in a known room with known people writes nothing.
 */
export function planReveals(input: { memberId: string; place: PlaceShown | null; characters: readonly Shown[] }): RevealPlan {
  const { memberId, place } = input;
  let placeWrite: RevealPlan["place"] = null;
  if (place !== null) {
    const added = withMember(place.visibleTo, memberId);
    if (added !== null || !place.descriptionShared) {
      placeWrite = { id: place.id, visibleTo: added ?? [...place.visibleTo], shareDescription: true };
    }
  }
  const characters: RevealPlan["characters"] = [];
  for (const c of input.characters) {
    const added = withMember(c.visibleTo, memberId);
    if (added !== null) characters.push({ id: c.id, visibleTo: added });
  }
  return { place: placeWrite, characters };
}

/**
 * What the Narrator's `show` writes to a place it hands over: the played character is shown it (as `planReveals`
 * does for the room the party stands in), and its map is shared only when the story handed the map over. Only ever
 * more: a map the DM already shares stays shared, and without `withMap` the map is left as the DM set it.
 * Null when the place already is all of that.
 */
export function planPlaceShare(input: { memberId: string; place: PlaceShown & { mapShared: boolean }; withMap: boolean }): { id: string; patch: { player_visible_to?: string[]; is_description_shared?: true; is_map_shared?: true } } | null {
  const { place, memberId } = input;
  const reveal = planReveals({ memberId, place, characters: [] }).place;
  const patch: { player_visible_to?: string[]; is_description_shared?: true; is_map_shared?: true } = {};
  if (reveal !== null) {
    patch.player_visible_to = reveal.visibleTo;
    patch.is_description_shared = true;
  }
  if (input.withMap && !place.mapShared) patch.is_map_shared = true;
  return Object.keys(patch).length === 0 ? null : { id: place.id, patch };
}
