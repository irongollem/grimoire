/**
 * Look after my character (#1059): what name a line carries, and whose
 * character it speaks for.
 *
 * One rule for every line a member sends for a character. Holding an active
 * hand-over for that character makes the line read "Tomas, for Mira" and tags
 * it with `for_party_member_id`, the key the owner's "while you were away"
 * summary reads. Anything else is the character's own name, as before.
 */
import type { CharacterCaretaker } from "@/types/caretaker.types";
import { speakingFor } from "@/lib/player/caretaking";

export interface Speaker {
  /** The name on the line. */
  name: string;
  /** The character the line speaks for, set only when someone else owns it. */
  forPartyMemberId: string | null;
}

interface SpeakerCharacter {
  id: string;
  name: string;
}

/** Who a line for `character` comes from. `active` is the hand-overs already in force (`useCharacterCaretakers().active`). */
export function speakerFor(
  character: SpeakerCharacter,
  active: readonly CharacterCaretaker[],
  userId: string | null,
  myName: string,
): Speaker {
  const handOver = userId ? active.find(row => row.party_member_id === character.id) : undefined;
  if (handOver && handOver.caretaker_user_id === userId) {
    return { name: speakingFor(myName, character.name), forPartyMemberId: character.id };
  }
  return { name: character.name, forPartyMemberId: null };
}

/**
 * The character a ready-made speaker name speaks for, for callers that hand a
 * name to the sender instead of a character. Null when the name is anything else.
 */
export function minderTagOfName(
  senderName: string,
  active: readonly CharacterCaretaker[],
  userId: string | null,
  myName: string,
  characters: readonly SpeakerCharacter[],
): string | null {
  if (!userId) return null;
  for (const character of characters) {
    const speaker = speakerFor(character, active, userId, myName);
    if (speaker.forPartyMemberId && speaker.name === senderName) return speaker.forPartyMemberId;
  }
  return null;
}
