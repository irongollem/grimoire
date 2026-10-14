/**
 * Look after my character (#1059): which characters a player can switch
 * between, and which one their seat should go back to.
 *
 * A caretaker usually still plays a character of their own, so the switcher
 * offers that one (their "home") beside every character they are minding.
 * Pure on purpose: `usePlayableCharacters` feeds it what the queries hold.
 */
import type { PartyMember } from "@/types/party.types";

export interface PlayableCharacter {
  member: PartyMember;
  kind: "own" | "minding";
  /** The owner's table name for a minded character; null for one's own or when the owner has none on file. */
  ownerName: string | null;
}

/**
 * The player's own character to show beside the ones they are minding: the one
 * the hand-over remembered (`return_member_id`) while it is still theirs, else
 * the one their seat points at, else the one they touched last.
 */
export function pickHome(
  owned: readonly PartyMember[],
  linkedId: string | null,
  returnMemberIds: readonly (string | null)[],
): PartyMember | null {
  for (const id of returnMemberIds) {
    const remembered = id === null ? undefined : owned.find(m => m.id === id);
    if (remembered) return remembered;
  }
  const linked = linkedId === null ? undefined : owned.find(m => m.id === linkedId);
  if (linked) return linked;
  const newestFirst = [...owned].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return newestFirst[0] ?? null;
}

/** The character after `activeId` in the list, wrapping round; the first when none is active. */
export function nextPlayableId(ids: readonly string[], activeId: string | null): string | null {
  if (ids.length === 0) return null;
  const at = activeId === null ? -1 : ids.indexOf(activeId);
  return ids[(at + 1) % ids.length];
}

/** The toast when the server moves a caretaker's seat back: "Mira went back to Pia." */
export function wentBackMessage(characterName: string | null, ownerName: string | null): string {
  if (characterName === null) return "The character you were looking after went back to their player.";
  return ownerName === null ? `${characterName} went back to their player.` : `${characterName} went back to ${ownerName}.`;
}
