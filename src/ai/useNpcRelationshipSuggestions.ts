import { computed, ref } from "vue";
import { textRunsOnLocalKey } from "@/ai/localKeyMode";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type { RelationshipSuggestion } from "@edge-shared/npcRelationshipSuggestions.ts";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { isAnyAiGenerating } from "./aiGeneratorRegistry";
import type { AiProvenance } from "./provenance";
import { useCampaignStore } from "@/stores/campaign";


export interface NpcRelationshipSuggestionsResponse {
  suggestions: RelationshipSuggestion[];
  grounded: boolean;
  ai_provenance: AiProvenance;
}

/** A suggestion whose target name has been mapped back to a real record. */
export type ResolvedSuggestion =
  | (Extract<RelationshipSuggestion, { kind: "npc" }> & { target_id: string })
  | (Extract<RelationshipSuggestion, { kind: "faction" }> & { target_id: string });

/**
 * Maps the server's name-based suggestions to ids, case-insensitively, and
 * drops any that no longer resolve (a rename or delete while the request was
 * in flight). Pure so it can be tested without the composable.
 */
export function resolveSuggestionTargets(
  suggestions: RelationshipSuggestion[],
  npcs: { id: string; name: string }[],
  factions: { id: string; name: string }[],
): ResolvedSuggestion[] {
  const npcIds = new Map(npcs.map((n) => [n.name.trim().toLowerCase(), n.id]));
  const factionIds = new Map(factions.map((f) => [f.name.trim().toLowerCase(), f.id]));
  const out: ResolvedSuggestion[] = [];
  for (const s of suggestions) {
    const key = s.target_name.trim().toLowerCase();
    const id = (s.kind === "npc" ? npcIds : factionIds).get(key);
    if (id) out.push({ ...s, target_id: id });
  }
  return out;
}

// Module-level singleton state, like the other generators.
const _state = createAiGenerationState();

/** What one NPC's Suggest run produced. Keyed by the NPC it was generated for. */
interface NpcSuggestionResult {
  suggestions: ResolvedSuggestion[];
  provenance: AiProvenance | null;
}
const _results = ref<Record<string, NpcSuggestionResult>>({});
/** The NPC a request is in flight for, and the NPC the last error belongs to. */
const _generatingFor = ref<string | null>(null);
const _errorFor = ref<string | null>(null);

/** Test seam: drop every stored result and in-flight marker. */
export function resetNpcRelationshipSuggestions() {
  _results.value = {};
  _generatingFor.value = null;
  _errorFor.value = null;
  _state.isGenerating.value = false;
  _state.error.value = null;
}

// Not registered with registerAiGenerator(): it produces no entity to navigate
// to, so the floating badge has nothing to offer. It still respects
// `isAnyAiGenerating` so two generations never run at once.

/**
 * "Suggest relationships" for one NPC. Server-path only: candidates come from
 * service-role reads and embeddings the browser cannot make, and BYOK-local is
 * a legacy tier that new AI features do not ship a weaker second path for.
 *
 * Only PROPOSES. Writing a tie is the caller's job, one accepted row at a time.
 */
export function useNpcRelationshipSuggestions() {
  const campaign = useCampaignStore();

  async function suggest(
    npcId: string,
    steer: string,
    lookups: {
      npcs: { id: string; name: string }[];
      factions: { id: string; name: string }[];
    },
  ): Promise<boolean> {
    if (isAnyAiGenerating.value) return false;
    _state.isGenerating.value = true;
    _state.error.value = null;
    _errorFor.value = npcId;
    _generatingFor.value = npcId;
    const { [npcId]: _dropped, ...others } = _results.value;
    _results.value = others;
    startAiQuotes();

    try {
      const isLocalMode = await textRunsOnLocalKey();
      if (isLocalMode) {
        throw new Error(
          "Relationship suggestions need the server so they can draw on your cast and factions, and are not available in local-key mode. " +
          "Switch to platform credits or a campaign API key in Settings → AI.",
        );
      }

      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign selected.");

      const { data, error } = await supabase.functions.invoke("suggest-npc-relationships", {
        body: { campaign_id: campaignId, npc_id: npcId, prompt: steer.trim() },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      if (data?.error) throw new Error(data.error);

      const result = data as NpcRelationshipSuggestionsResponse;
      const resolved = resolveSuggestionTargets(result.suggestions, lookups.npcs, lookups.factions);
      if (resolved.length === 0) {
        throw new Error("No usable suggestions. Try again.");
      }
      // Stored under the NPC it was asked for, so a reply that lands after the
      // DM has moved to another NPC stays attached to its own.
      _results.value = {
        ..._results.value,
        [npcId]: { suggestions: resolved, provenance: result.ai_provenance },
      };
      return true;
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Suggestion failed";
      return false;
    } finally {
      _state.isGenerating.value = false;
      _generatingFor.value = null;
      stopAiQuotes();
    }
  }

  /**
   * The suggestions view for ONE NPC (a getter, so it follows a reused component's prop). Any other NPC sees an empty list, no
   * provenance, no error and no in-flight state, so a result can never be shown
   * on, or accepted into, an NPC it was not generated for.
   */
  function forNpc(npcId: () => string) {
    const mine = () => _results.value[npcId()];
    const suggestions = computed(() => mine()?.suggestions ?? []);
    const provenance = computed(() => mine()?.provenance ?? null);
    const isGenerating = computed(() => _generatingFor.value === npcId());
    const error = computed(() => (_errorFor.value === npcId() ? _state.error.value : null));

    function dismiss(suggestion: ResolvedSuggestion) {
      const current = mine();
      if (!current) return;
      _results.value = {
        ..._results.value,
        [npcId()]: {
          ...current,
          suggestions: current.suggestions.filter((s) => s !== suggestion),
        },
      };
    }

    function dismissAll() {
      const { [npcId()]: _dropped, ...others } = _results.value;
      _results.value = others;
      if (_errorFor.value === npcId()) _state.error.value = null;
    }

    return { suggestions, provenance, isGenerating, error, dismiss, dismissAll };
  }

  return {
    suggest,
    forNpc,
  };
}
