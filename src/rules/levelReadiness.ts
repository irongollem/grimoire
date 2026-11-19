import { levelForXp } from "@/types/party.types";

/**
 * How a campaign's characters gain levels (#1021 row 27). With the Experience Points rule on, by XP (PHB 2014
 * "Beyond 1st Level", the advancement table); otherwise by milestone, when the story reaches a point the DM chose
 * and the campaign's party level rises past the character.
 */
export type LevellingMode = "experience" | "milestone";

export interface LevelReadinessInput {
  mode: LevellingMode;
  level: number;
  experiencePoints: number | null;
  /** The campaign's party level; null until the DM sets one or a milestone is reached. */
  partyLevel: number | null;
}

/** Whether a character may level up now. */
export function readyToLevelUp(input: LevelReadinessInput): boolean {
  if (input.mode === "experience") return levelForXp(input.experiencePoints ?? 0) > input.level;
  return input.partyLevel !== null && input.level < input.partyLevel;
}

/**
 * Whether the DM presses Level Up for this character, rather than its player. The maintainer (19 Nov 2026): the
 * player presses it, and the DM only for a character nobody plays: one with no owner, or one the DM owns. Not
 * `is_dm_managed`: that marks a character the DM offered, and it stays set after a player claims the character.
 */
export function dmLevelsUp(member: { owner_user_id: string | null }, dmUserId: string | null): boolean {
  return member.owner_user_id === null || member.owner_user_id === dmUserId;
}

/**
 * Which Level Up a sheet offers its viewer: the DM's (opens the editor), the player's (the level-up flow), or none.
 * A DM sees it only for a character nobody plays; a player only on a sheet that shows player actions.
 */
export function levelUpAction(input: {
  ready: boolean;
  viewerIsDm: boolean;
  viewerId: string | null;
  member: { owner_user_id: string | null };
  hidePlayerActions: boolean;
}): "dm" | "player" | null {
  if (!input.ready) return null;
  if (input.viewerIsDm) return dmLevelsUp(input.member, input.viewerId) ? "dm" : null;
  return input.hidePlayerActions ? null : "player";
}
