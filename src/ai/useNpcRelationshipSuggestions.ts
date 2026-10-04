import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type { RelationshipSuggestion } from "@edge-shared/npcRelationshipSuggestions.ts";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { isAnyAiGenerating } from "./aiGeneratorRegistry";
import type { AiProvenance } from "./provenance";
import { useCampaignStore } from "@/stores/campaign";

const LOCAL_MODE_KEY = "grimoire_key_local_mode";

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
const _suggestions = ref<ResolvedSuggestion[]>([]);
const _provenance = ref<AiProvenance | null>(null);

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
    _suggestions.value = [];
    _provenance.value = null;
    startAiQuotes();

    try {
      const isLocalMode =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(LOCAL_MODE_KEY) === "local";
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
      _suggestions.value = resolved;
      _provenance.value = result.ai_provenance;
      return true;
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Suggestion failed";
      return false;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  function dismiss(suggestion: ResolvedSuggestion) {
    _suggestions.value = _suggestions.value.filter((s) => s !== suggestion);
  }

  function dismissAll() {
    _suggestions.value = [];
    _state.error.value = null;
  }

  return {
    ..._state,
    suggestions: _suggestions,
    provenance: _provenance,
    suggest,
    dismiss,
    dismissAll,
  };
}
