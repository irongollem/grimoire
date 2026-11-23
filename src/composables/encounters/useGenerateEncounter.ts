/**
 * "Generate an encounter with AI and save it", the steps `EncounterGeneratorPanel` used to own inline, extracted so
 * Ask Grimoire (#1253) runs the very same resolve and create.
 *
 * The model returns monster *names*; they are resolved against the Bestiary into combatants (#337), a name that is not
 * in it is kept as an "Add manually" line in the description instead of a stat-block-less stub, and the encounter
 * starts with the whole active party and the companions who fight.
 *
 * Deliberately narrow, like `useGenerateMonster`: the page keeps its version picker (#601), its quota paywall and its
 * navigation. A failed save throws.
 */
import { ref } from "vue";
import { until } from "@vueuse/core";
import { useCreateEncounter } from "@/composables/encounters/useEncounters";
import { useCompanions } from "@/composables/encounters/useCompanions";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useEncounterGeneration, type EncounterGenerationOptions } from "@/ai/useEncounterGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import type { EncounterAiResult, EncounterCombatantAiResult } from "@/ai/types";
import { resolveGeneratedCombatants } from "@/lib/encounters/resolveGeneratedCombatants";
import { takesPartInCombat } from "@/lib/encounters/companionCombat";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { DEFAULT_FACTIONS, type CombatantDef, type Encounter } from "@/types/encounter.types";

export interface GenerateEncounterOutcome {
  /** The created row's id, or `null` when generation failed. */
  id: string | null;
  name: string | null;
  /** A user-facing reason for a `null` id. */
  error: string | null;
  /** Creatures the model named that the Bestiary does not have, listed in the description to add by hand. */
  unmatched: number;
}

/** How long a run waits for the Bestiary and the party before it gives up rather than build an empty encounter. */
const DATA_WAIT_MS = 20_000;

/** "Goblin (scout)": a name with the role the model gave it. */
export function unmatchedLabel(entry: EncounterCombatantAiResult): string {
  return entry.role ? `${entry.name} (${entry.role})` : entry.name;
}

/**
 * The encounter's Tiptap-JSON description from the AI's flavour text, plus an "Add manually" line for any combatant
 * the Bestiary lookup missed: the unmatched list is otherwise lost once the panel closes.
 */
export function buildEncounterDescription(result: EncounterAiResult, unmatched: EncounterCombatantAiResult[]): string {
  const parts: string[] = [];
  if (result.environment) parts.push(`Environment: ${result.environment}`);
  if (result.tactics) parts.push(`Tactics: ${result.tactics}`);
  if (result.twist) parts.push(`Twist: ${result.twist}`);
  if (unmatched.length) parts.push(`Add manually: ${unmatched.map((u) => unmatchedLabel(u)).join(", ")}`);
  return toTiptapJson(parts.join("\n\n"));
}

export function useGenerateEncounter() {
  const { mutateAsync: createEncounter } = useCreateEncounter();
  // The page reads the party and the companions all the time (its panel is mounted on every DM page), so reading
  // them here adds no request: it is the same cache.
  const { data: party } = useActiveParty();
  const { data: companions } = useCompanions();
  const { generate, error: genError } = useEncounterGeneration();

  // The Bestiary is read only once a run needs it, as the page reads it only while its panel is open (#972).
  const wanted = ref(false);
  const { data: monsters } = useMonsterIndex(() => ({ enabled: wanted.value }));

  /** Saves an encounter with `combatants`; `unmatched` names go to the description. Throws when the save fails. */
  async function saveGeneratedEncounter(
    result: EncounterAiResult,
    combatants: CombatantDef[],
    unmatched: EncounterCombatantAiResult[],
    /** The place of this campaign the fight happens in (the Atlas lists it there). The page offers no picker; Ask can name one. */
    locationId: string | null = null,
  ): Promise<Encounter> {
    // Never build an encounter against a party that has not arrived: it would start without them.
    if (party.value === undefined || companions.value === undefined) {
      throw new Error("The party has not loaded yet. Try again in a moment.");
    }
    return createEncounter({
      name: result.name,
      description: buildEncounterDescription(result, unmatched),
      party_member_ids: party.value.map((m) => m.id),
      // Companions come along too, matching what EncounterDetail does for a hand-built new encounter ("start with
      // the whole party, bench whoever shouldn't join"). They also count as allies in the difficulty calculation:
      // leaving them out would make the generated encounter read as harder than the identical one built by hand.
      companion_ids: companions.value.filter(takesPartInCombat).map((c) => c.id),
      party_member_factions: {},
      combatants,
      factions: [...DEFAULT_FACTIONS],
      item_ids: [],
      trap_ids: [],
      reward_currency_pools: [],
      events: [],
      location_id: locationId,
      is_finished: false,
      lair_enabled: false,
      lair_owner_def_id: null,
      ai_provenance: result.ai_provenance ?? null,
    });
  }

  async function generateAndCreateEncounter(
    concept: string,
    options: EncounterGenerationOptions & { locationId?: string | null },
  ): Promise<GenerateEncounterOutcome> {
    const { locationId = null, ...generationOptions } = options;
    // Checked up front: `generate` returns null on this without touching its error, which would read stale.
    if (isAnyAiGenerating.value) {
      return { id: null, name: null, error: "Another AI generation is already in progress.", unmatched: 0 };
    }
    wanted.value = true;
    const result = await generate(concept, generationOptions);
    if (!result) {
      return { id: null, name: null, error: genError.value ?? "Encounter generation failed.", unmatched: 0 };
    }
    // Resolving against a Bestiary that has not arrived would read every name as missing and save an empty encounter.
    await until(() => monsters.value !== undefined && party.value !== undefined && companions.value !== undefined)
      .toBe(true, { timeout: DATA_WAIT_MS, throwOnTimeout: true });
    const bestiary = monsters.value;
    if (bestiary === undefined) throw new Error("The Bestiary did not load.");
    const resolved = resolveGeneratedCombatants(result.combatants, bestiary);
    const encounter = await saveGeneratedEncounter(result, resolved.matched.map((m) => m.def), resolved.unmatched, locationId);
    return { id: encounter.id, name: result.name, error: null, unmatched: resolved.unmatched.length };
  }

  return { saveGeneratedEncounter, generateAndCreateEncounter };
}
