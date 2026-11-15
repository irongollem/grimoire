import { useEncounterRunStore } from "@/stores/encounterRun";
import { sendAlone } from "@/lib/encounters/fightWire";

/**
 * Abandons an encounter's fight from outside the runner (the encounter's own Stop and Restart buttons): the
 * server closes the fight and blanks the rolls, with hit points and conditions left as they were. If this tab's
 * runner store still holds that fight it is cleared, so running the encounter again starts a new one instead of
 * showing the old.
 */
export async function abandonFight(encounterId: string): Promise<void> {
  await sendAlone(encounterId, { type: "abandon" });
  const run = useEncounterRunStore();
  if (run.encounterId === encounterId) run.reset();
}
