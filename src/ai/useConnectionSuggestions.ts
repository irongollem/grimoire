import { computed, ref } from "vue";
import { textRunsOnLocalKey } from "@/ai/localKeyMode";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type { ResolvedSuggestion, SetAsideClaim } from "@edge-shared/connectionSuggestions.ts";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { isAnyAiGenerating } from "./aiGeneratorRegistry";
import type { AiProvenance } from "./provenance";
import { useCampaignStore } from "@/stores/campaign";
import type { WorldRef } from "@/types/connections.types";

export type { ResolvedSuggestion, SetAsideClaim };

export interface ConnectionSuggestionsResponse {
  suggestions: ResolvedSuggestion[];
  /** Claims the server refused to offer, with the reason. */
  setAside?: SetAsideClaim[];
  grounded: boolean;
  /** Null when every suggestion was set aside: nothing was charged and nothing can be accepted. */
  ai_provenance: AiProvenance | null;
}

// Module-level singleton state, like the other generators.
const _state = createAiGenerationState();

/** What one subject's Suggest run produced. Keyed by the thing it was generated for. */
interface SubjectResult {
  suggestions: ResolvedSuggestion[];
  setAside: SetAsideClaim[];
  provenance: AiProvenance | null;
}
const _results = ref<Record<string, SubjectResult>>({});
/** The subject a request is in flight for, and the subject the last error belongs to. */
const _generatingFor = ref<string | null>(null);
const _errorFor = ref<string | null>(null);

function keyOf(subject: WorldRef): string {
  return `${subject.kind}:${subject.id}`;
}

/** Test seam: drop every stored result and in-flight marker. */
export function resetConnectionSuggestions() {
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
 * "Suggest connections" for one thing (an NPC, character, faction, place, deity
 * or item). Server-path only: candidates come from service-role reads and
 * embeddings the browser cannot make, and BYOK-local is a legacy tier that new
 * AI features do not ship a weaker second path for.
 *
 * Only PROPOSES. Writing a tie is the caller's job, one accepted row at a time.
 * The server resolves each suggestion's target to an id, so a reply carries
 * everything `useCreateConnection` needs.
 */
export function useConnectionSuggestions() {
  const campaign = useCampaignStore();

  async function suggest(subject: WorldRef, steer: string): Promise<boolean> {
    if (isAnyAiGenerating.value) return false;
    const key = keyOf(subject);
    _state.isGenerating.value = true;
    _state.error.value = null;
    _errorFor.value = key;
    _generatingFor.value = key;
    const { [key]: _dropped, ...others } = _results.value;
    _results.value = others;
    startAiQuotes();

    try {
      const isLocalMode = await textRunsOnLocalKey();
      if (isLocalMode) {
        throw new Error(
          "Connection suggestions need the server so they can draw on your campaign, and are not available in local-key mode. " +
          "Switch to platform credits or a campaign API key in Settings → AI.",
        );
      }

      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign selected.");

      const { data, error } = await supabase.functions.invoke("suggest-connections", {
        body: { campaign_id: campaignId, subject_kind: subject.kind, subject_id: subject.id, prompt: steer.trim() },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      if (data?.error) throw new Error(data.error);

      const result = data as ConnectionSuggestionsResponse;
      const setAside = result.setAside ?? [];
      if (result.suggestions.length === 0 && setAside.length === 0) {
        throw new Error("No usable suggestions. Try again.");
      }
      // Stored under the subject it was asked for, so a reply that lands after the
      // DM has moved to another sheet stays attached to its own.
      _results.value = {
        ..._results.value,
        [key]: { suggestions: result.suggestions, setAside, provenance: result.ai_provenance },
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
   * The suggestions view for ONE subject (a getter, so it follows a reused component's prop). Any other subject sees an
   * empty list, no provenance, no error and no in-flight state, so a result can never be shown on, or accepted into, a
   * sheet it was not generated for.
   */
  function forSubject(subject: () => WorldRef) {
    const mine = () => _results.value[keyOf(subject())];
    const suggestions = computed(() => mine()?.suggestions ?? []);
    const setAside = computed(() => mine()?.setAside ?? []);
    const provenance = computed(() => mine()?.provenance ?? null);
    const isGenerating = computed(() => _generatingFor.value === keyOf(subject()));
    const error = computed(() => (_errorFor.value === keyOf(subject()) ? _state.error.value : null));

    function dismiss(suggestion: ResolvedSuggestion) {
      const current = mine();
      if (!current) return;
      _results.value = {
        ..._results.value,
        [keyOf(subject())]: { ...current, suggestions: current.suggestions.filter((s) => s !== suggestion) },
      };
    }

    function dismissAll() {
      const { [keyOf(subject())]: _dropped, ...others } = _results.value;
      _results.value = others;
      if (_errorFor.value === keyOf(subject())) _state.error.value = null;
    }

    return { suggestions, setAside, provenance, isGenerating, error, dismiss, dismissAll };
  }

  return { suggest, forSubject };
}
