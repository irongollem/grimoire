import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useParty } from "@/composables/party/useParty";
import { useConcentration, CONCENTRATION_BREAKING_CONDITIONS } from "@/composables/party/useConcentration";
import { combatantNameOf, heldConcentrationSpells, UNNAMED_CONCENTRATION } from "@/lib/encounters/conditionSources";
import { getExhaustionLevel, hasCondition, isExhaustion, setExhaustionLevel } from "@/rules/conditions";
import type { ConditionName } from "@/rules/conditions";
import type { AppliedCondition } from "@/types/condition.types";
import type { RunCombatant } from "@/types/encounter.types";

/**
 * A combatant's conditions in the runner (#1018): what to show, and how the DM
 * adds, edits, removes and ends them. Called once per row or card, beside
 * `useRunnerCombatant`, which owns the HP side.
 */
export function useRunnerConditions(getCombatant: MaybeRefOrGetter<RunCombatant>) {
  const store = useEncounterRunStore();
  const { data: partyList } = useParty();
  const { endConcentration } = useConcentration();

  const combatant = computed(() => toValue(getCombatant));

  const member = computed(() => {
    const id = combatant.value.party_member_id;
    return id ? (partyList.value?.find((m) => m.id === id) ?? null) : null;
  });

  /** A party member's sheet is the authority for its conditions; everyone else's live in the run. */
  const displayConditions = computed((): AppliedCondition[] =>
    combatant.value.type === "player" && member.value ? member.value.conditions : combatant.value.conditions,
  );

  const nonExhaustion = computed(() => displayConditions.value.filter((c) => !isExhaustion(c)));

  /** Names the DM may see for a condition's source: every combatant in the fight. */
  const nameOf = computed(() => combatantNameOf(store.combatants));

  /** The spell a party member concentrates on, from their sheet. */
  const pcConcentration = computed((): string | null => member.value?.concentration?.spellName ?? null);

  /** Spells a non-party combatant holds on others through conditions it applied. */
  const heldSpells = computed((): string[] =>
    combatant.value.party_member_id ? [] : heldConcentrationSpells(store.combatants, combatant.value.instance_id),
  );

  /** The spell a combatant concentrates on right now, from a party member's sheet; null for anyone else. */
  function concentrationOf(instanceId: string): string | null {
    const pmId = store.combatants.find((c) => c.instance_id === instanceId)?.party_member_id;
    return pmId ? (partyList.value?.find((m) => m.id === pmId)?.concentration?.spellName ?? null) : null;
  }

  async function breakConcentration(reason: string) {
    if (member.value?.concentration) await endConcentration(member.value, { reason });
    else if (!combatant.value.party_member_id) store.endConcentration(combatant.value.instance_id);
  }

  function onExhaustionChange(newLevel: number) {
    store.setConditions(combatant.value.instance_id, setExhaustionLevel(displayConditions.value, newLevel));
  }

  /** Applies a record (the editor's save, or a plain pick); a concentration-breaking condition new to the combatant ends its concentration. */
  async function applyRecord(record: AppliedCondition) {
    const isNew = !hasCondition(displayConditions.value, record.name);
    store.applyCondition(combatant.value.instance_id, record);
    if (isNew && CONCENTRATION_BREAKING_CONDITIONS.includes(record.name as ConditionName)) {
      await breakConcentration(record.name.toLowerCase());
    }
  }

  function removeByName(name: string) {
    store.removeCondition(combatant.value.instance_id, name);
  }

  async function onConditionPickerPick(name: ConditionName) {
    if (name === "Exhaustion") {
      onExhaustionChange(getExhaustionLevel(displayConditions.value) > 0 ? 0 : 1);
    } else if (hasCondition(displayConditions.value, name)) {
      removeByName(name);
    } else {
      await applyRecord({ name });
    }
  }

  /** Drop what this combatant concentrates on: the sheet's spell for a party member, or one held spell for the rest. */
  async function dropConcentration(spell?: string) {
    if (member.value?.concentration) {
      await endConcentration(member.value, { reason: "dropped" });
    } else if (!combatant.value.party_member_id) {
      store.endConcentration(combatant.value.instance_id, spell === UNNAMED_CONCENTRATION ? undefined : spell);
    }
  }

  return {
    displayConditions,
    nonExhaustion,
    nameOf,
    pcConcentration,
    concentrationOf,
    heldSpells,
    onExhaustionChange,
    applyRecord,
    removeByName,
    onConditionPickerPick,
    dropConcentration,
  };
}
