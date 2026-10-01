import { isRulesetAdmissible } from "@/composables/party/useCharacterRuleset";
import type { RulesetKey } from "@/types/ruleset.types";

/**
 * The edition question in the character wizard (#943): which table the new
 * character will land at, what that table says about each edition, and whether
 * the choice may be taken forward. Pure, so the rules read in one place and are
 * tested without mounting the wizard.
 */

/** The four fields of a campaign the edition step reads. */
export interface EditionCampaign {
  id: string;
  name: string;
  ruleset: RulesetKey;
  allows_mixed_rulesets: boolean;
}

/**
 * The campaign a new character will be placed at, or null when it starts in the
 * pool. A DM roster create lands on the active campaign's roster; a player's
 * character is brought to the active campaign only when they sit at that table
 * (`campaignToAttachAfterCreate` reads the same answer after the create, so the
 * membership rule lives only here).
 */
export function creationLandingCampaign(opts: {
  isDmCreate: boolean;
  activeCampaign: EditionCampaign | null;
  isMemberOfActiveCampaign: boolean;
}): EditionCampaign | null {
  if (!opts.activeCampaign) return null;
  return opts.isDmCreate || opts.isMemberOfActiveCampaign ? opts.activeCampaign : null;
}

/**
 * The campaign a newly-created character should be attached to, or null when
 * nothing needs attaching. Takes the landing campaign so the membership rule is
 * not restated.
 *
 * A DM roster row is created in its campaign, so there is nothing to attach. A
 * player's character is always created in the pool (see
 * resolveCharacterPlacement), and a seat may only point at a character that is
 * already in its campaign, so the seat cannot simply be written. For two months
 * it was: the wizard created the pool row, wrote it onto the player's seat, the
 * membership guard refused ("Cannot link a character from another campaign"),
 * and the rollback deleted the character. Every player who already sat at a
 * table got "Couldn't save the character" (found 2 Oct 2026). The character goes
 * through attach instead, which moves it into the campaign and fills the seat
 * only when the seat is empty.
 */
export function campaignToAttachAfterCreate(landing: EditionCampaign | null, isDmCreate: boolean): string | null {
  if (isDmCreate || !landing) return null;
  return landing.id;
}

/**
 * The edition a new character starts with: its table's when it will land at
 * one, otherwise nothing, because the player has to choose. Guessing 2014 for
 * someone with no table would be inventing an answer.
 */
export function initialCreationRuleset(landing: EditionCampaign | null): RulesetKey | null {
  return landing ? landing.ruleset : null;
}

/** The line under each edition on the picker, from the table's point of view. Empty without a table. */
export function editionStepNotes(opts: {
  landing: EditionCampaign | null;
  isDmCreate: boolean;
}): Partial<Record<RulesetKey, string>> {
  const { landing, isDmCreate } = opts;
  if (!landing) return {};
  const other: RulesetKey = landing.ruleset === "2014" ? "2024" : "2014";
  const otherNote = landing.allows_mixed_rulesets
    ? "Your table takes both editions."
    : isDmCreate
      ? "This table does not take this edition."
      : "Your table does not take this edition. The character would rest in your pool.";
  return { [landing.ruleset]: "Your table plays this.", [other]: otherNote };
}

/**
 * Whether Next is blocked on the edition step. An edition must be chosen, and a
 * DM roster row cannot be created at a table that does not take it (a player's
 * character can: it simply stays in their pool).
 */
export function editionStepBlocked(opts: {
  chosen: RulesetKey | null;
  landing: EditionCampaign | null;
  isDmCreate: boolean;
}): boolean {
  if (opts.chosen === null) return true;
  return opts.isDmCreate && opts.landing !== null && !isRulesetAdmissible({ ruleset: opts.chosen }, opts.landing);
}
