import { useConfirm } from "@/composables/useConfirm";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import type { ConcentrationState, PartyMember } from "@/types/party.types";
import type { Spell } from "@/types/spell.types";

/**
 * Conditions that automatically end concentration when applied to a creature.
 * Per 5e RAW: Unconscious, Paralyzed, Stunned, Petrified, Incapacitated (and death).
 */
export const CONCENTRATION_BREAKING_CONDITIONS = [
  "Unconscious",
  "Paralyzed",
  "Stunned",
  "Petrified",
  "Incapacitated",
];

/** DC for a concentration check after taking `damage` HP of damage. */
export function concentrationSaveDC(damage: number): number {
  return Math.max(10, Math.floor(damage / 2));
}

export function useConcentration() {
  const { mutateAsync: updateMember } = useUpdatePartyMember();
  const { confirm } = useConfirm();
  const { sendFlavorMessage } = useCampaignMessages();
  const { promptRoll } = usePromptedRoll();

  async function prepareConcentration(
    member: PartyMember,
    spell: Spell,
    opts: { castAtLevel?: number; round?: number | null } = {},
  ): Promise<ConcentrationState | null> {
    if (member.concentration) {
      const ok = await confirm(
        `You are concentrating on ${member.concentration.spellName}. Casting ${spell.name} will end ${member.concentration.spellName}.`,
        { title: "Break concentration?", confirmLabel: "Cast anyway", danger: false },
      );
      if (!ok) return null;
    }
    return {
      spellId: spell.id ?? null,
      spellName: spell.name,
      castAtLevel: opts.castAtLevel ?? spell.level ?? 0,
      startedRound: opts.round ?? null,
      appliedEffectIds: [],
    };
  }

  /**
   * Begin concentration on a spell. If the caster is already concentrating,
   * prompts the user to drop the previous one.
   *
   * Returns true if concentration was started, false if the user cancelled.
   */
  async function startConcentration(
    member: PartyMember,
    spell: Spell,
    opts: { castAtLevel?: number; round?: number | null } = {},
  ): Promise<boolean> {
    const state = await prepareConcentration(member, spell, opts);
    if (!state) return false;
    await updateMember({ id: member.id, update: { concentration: state } });
    void sendFlavorMessage(`begins concentrating on ${spell.name}`, spell.name);
    return true;
  }

  /** Clear the member's concentration. Silent mode skips the chat log entry. */
  async function endConcentration(
    member: PartyMember,
    opts: { silent?: boolean; reason?: string } = {},
  ): Promise<void> {
    if (!member.concentration) return;
    const prevName = member.concentration.spellName;
    await updateMember({ id: member.id, update: { concentration: null } });
    if (!opts.silent) {
      const tail = opts.reason ? ` (${opts.reason})` : "";
      void sendFlavorMessage(`concentration on ${prevName} ends${tail}`, prevName);
    }
  }

  /**
   * Prompt a Constitution saving throw for concentration after taking `damage`.
   * Returns true if concentration held (or member wasn't concentrating), false
   * if the save failed (caller should expect concentration to be cleared).
   * Ends concentration automatically on failure.
   */
  async function rollConcentrationSave(
    member: PartyMember,
    damage: number,
  ): Promise<boolean> {
    if (!member.concentration || damage <= 0) return true;
    const dc = concentrationSaveDC(damage);
    const conMod = Math.floor((member.con - 10) / 2);
    const pb = member.saving_throw_proficiencies?.includes("con") ? member.proficiency_bonus : 0;
    const modifier = conMod + pb;
    const spellName = member.concentration.spellName;
    const label = `Con Save (concentration on ${spellName}, DC ${dc})`;
    const result = await promptRoll({
      counts: { 20: 1 },
      modifier,
      label,
      senderName: member.name,
    });
    if (!result) return true;
    const success = result.total >= dc;
    if (!success) {
      await endConcentration(member, { reason: "failed save" });
    }
    return success;
  }

  return {
    prepareConcentration,
    startConcentration,
    endConcentration,
    rollConcentrationSave,
  };
}
