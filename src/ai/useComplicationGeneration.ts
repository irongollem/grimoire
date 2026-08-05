import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import type { ComplicationAiResult } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useCampaignStore } from "@/stores/campaign";
import { useEncounterRunStore } from "@/stores/encounterRun";

const LOCAL_MODE_KEY = "grimoire_key_local_mode";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();
const _result = ref<ComplicationAiResult | null>(null);

// Deliberately NOT registered with registerAiGenerator(). That registry backs
// the floating AiGenerationBadge, whose contract is "your generation is still
// running, click to go back to it" — it navigates to a finished entity by id
// and reopens a side panel. A complication produces no entity and lives inside
// the encounter runner, which the DM is already looking at; a badge offering
// to navigate them somewhere mid-combat would be worse than no badge.

export type ComplicationMode = "complication" | "reinforcements";

/**
 * Mid-fight complication / reinforcement generation (#604).
 *
 * Server-path only, like the loot generator: the proposal is built from
 * bestiary and campaign-entity vectors that only the edge function's
 * service-role client can read, and BYOK-local is a legacy tier that new AI
 * features do not ship a weaker second path for.
 *
 * This composable only PROPOSES. It never touches the encounter — resolving,
 * previewing and (on the DM's confirmation) adding the event are the panel's
 * job, so there is no path from "generation finished" to "something changed in
 * the fight" that does not pass through a human.
 */
export function useComplicationGeneration() {
  const campaign = useCampaignStore();
  const run = useEncounterRunStore();

  /** The fight as the runner currently has it — see EncounterSnapshot in the
   *  edge function for why this is sent rather than read from encounter_state. */
  function buildSnapshot() {
    const factionName = (id: string) => run.factions.find((f) => f.id === id)?.name ?? id;
    return {
      name: run.encounterName,
      round: run.round,
      factions: run.factions.map((f) => f.name),
      combatants: run.sortedCombatants.map((c) => ({
        name: c.name,
        faction: factionName(c.faction_id),
        // Rounded to a percentage rather than sent as raw hp/max_hp: the model
        // needs "badly hurt" versus "untouched", and exact hit points are
        // DM-side detail with no bearing on the proposal.
        hp_pct: c.max_hp > 0 ? Math.round((c.hp / c.max_hp) * 100) : 100,
        is_player: c.instance_id.startsWith("p-"),
      })),
    };
  }

  async function generate(mode: ComplicationMode, steer: string): Promise<ComplicationAiResult | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    _result.value = null;
    startAiQuotes();

    try {
      const isLocalMode =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(LOCAL_MODE_KEY) === "local";
      if (isLocalMode) {
        throw new Error(
          "Complications need the server so they can draw on your bestiary and cast — not available in local-key mode. " +
          "Switch to platform credits or a campaign API key in Settings → AI.",
        );
      }

      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign selected.");

      const { data, error } = await supabase.functions.invoke("generate-complication", {
        body: {
          campaign_id: campaignId,
          mode,
          prompt: steer.trim(),
          snapshot: buildSnapshot(),
        },
      });

      if (error) throw new Error(await edgeErrorMessage(error));
      if (data?.error) throw new Error(data.error);

      const result = data as ComplicationAiResult;
      if (typeof result.narration !== "string" || !result.narration.trim()) {
        throw new Error("The AI returned a complication with nothing to read out — please try again.");
      }

      _result.value = result;
      return result;
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  function clearResult() {
    _result.value = null;
    _state.error.value = null;
  }

  return {
    ..._state,
    result: _result,
    generate,
    clearResult,
  };
}
