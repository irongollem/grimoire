import { watch } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useParty, useUpdatePartyMember } from "@/composables/party/useParty";
import { useAllCampaignCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useToast } from "@/composables/useToast";
import { wildShapeRulesFor } from "@/rules/wildshape";
import { evergreenWildShapeRegain } from "@/rules/wildshapeEvergreen";

/**
 * 2024 Evergreen Wild Shape (druid level 20) in the encounter runner: when a
 * druid's initiative goes from unrolled to rolled and they have no Wild Shape
 * uses left, one comes back. Mounted once by EncounterRunner.
 *
 * Only a null -> number transition counts. A combatant that arrives with an
 * initiative already set (a resumed fight) or that is re-rolled later is not
 * "rolling Initiative" for the first time, and each combatant fires at most
 * once per fight. Monsters, NPCs and companions carry no party_member_id on a
 * `player` row, so they never reach the write.
 */
export function useEvergreenWildShape() {
  const store = useEncounterRunStore();
  const { data: party } = useParty();
  const { data: classRows } = useAllCampaignCharacterClasses();
  const { ruleset } = useRuleset();
  const { mutateAsync: updatePartyMember } = useUpdatePartyMember();
  const toast = useToast();

  // Instance ids already handled this fight; cleared when the roster is replaced.
  const handled = new Set<string>();

  watch(
    () => store.combatants,
    () => handled.clear(),
  );

  async function regain(partyMemberId: string) {
    const member = party.value?.find((m) => m.id === partyMemberId);
    // Class rows still loading: without them a multiclass druid reads as a
    // non-druid, so wait rather than judge on the legacy fields.
    if (!member || !classRows.value) return;
    const rows = classRows.value.filter((row) => row.party_member_id === partyMemberId);
    const rules = wildShapeRulesFor(member, rows, ruleset.value);
    const next = evergreenWildShapeRegain(rules, member.wildshapes_used ?? 0);
    if (next === null) return;
    try {
      await updatePartyMember({ id: partyMemberId, update: { wildshapes_used: next } });
      toast.info(`${member.name} regains a Wild Shape use (Evergreen Wild Shape).`);
    } catch (e) {
      toast.error(`Could not restore ${member.name}'s Wild Shape use: ${toast.fromError(e)}`);
    }
  }

  watch(
    () =>
      store.combatants
        .filter((c) => c.type === "player" && c.party_member_id)
        .map((c) => ({ iid: c.instance_id, pmId: c.party_member_id!, rolled: c.initiative !== null })),
    (now, before) => {
      if (!before) return;
      for (const c of now) {
        if (!c.rolled || handled.has(c.iid)) continue;
        const was = before.find((b) => b.iid === c.iid);
        if (!was || was.rolled) continue;
        handled.add(c.iid);
        void regain(c.pmId);
      }
    },
  );
}
