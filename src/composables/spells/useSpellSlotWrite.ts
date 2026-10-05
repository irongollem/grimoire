import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import { spellSlotKey } from "@/rules/spellSlots";
import type { SpellSlotEntry } from "@/types/party.types";

/**
 * The one place a spell slot's `used` count is written, shared by the player
 * spell list and the Hearth so both save the same way and report the same
 * error. Writes the whole `spell_slots` array with the matching slot changed.
 */
export function useSpellSlotWrite() {
  const { mutateAsync: updateMember } = useUpdatePartyMember();
  const toast = useToast();

  async function setSlotUsed(
    member: { id: string; spell_slots: readonly SpellSlotEntry[] },
    slot: SpellSlotEntry,
    used: number,
  ): Promise<void> {
    const updated = member.spell_slots.map((s) => (spellSlotKey(s) === spellSlotKey(slot) ? { ...s, used } : s));
    try {
      await updateMember({ id: member.id, update: { spell_slots: updated } });
    } catch (error) {
      toast.error(toast.fromError(error, "Couldn't update your spell slots."));
    }
  }

  return { setSlotUsed };
}
