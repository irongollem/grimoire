/**
 * Who an earlier sitting was played as, for the list on the table's start page (#1021).
 *
 * A sitting with no character is not the same as one whose character has since left the party: the first was
 * simply begun without choosing one (every sitting made before characters could be chosen, and any made by the
 * terminal chat), and telling its owner that "a character is no longer in the party" sends them looking for
 * someone who never existed.
 */
export function sittingWho(characterName: string | null, partyMemberId: string | null): string {
  if (characterName !== null) return characterName;
  return partyMemberId === null ? "No character chosen" : "A character no longer in the party";
}
