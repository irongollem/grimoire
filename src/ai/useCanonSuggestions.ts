import { computed, ref } from "vue";
import { textRunsOnLocalKey } from "@/ai/localKeyMode";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type { CanonSetAside, PremiseSuggestion, TruthSuggestion } from "@edge-shared/canonSuggestions.ts";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { isAnyAiGenerating } from "./aiGeneratorRegistry";
import type { AiProvenance } from "./provenance";
import { useCampaignStore } from "@/stores/campaign";

export type { CanonSetAside, PremiseSuggestion, TruthSuggestion };

export type CanonSuggestionMode = "premise" | "truths";

interface Shapes {
  premise: PremiseSuggestion;
  truths: TruthSuggestion;
}

interface CanonSuggestionsResponse<T> {
  suggestions: T[];
  setAside?: CanonSetAside[];
  /** Null when everything was set aside: nothing was charged and nothing can be accepted. */
  ai_provenance: AiProvenance | null;
}

interface ModeResult {
  suggestions: unknown[];
  setAside: CanonSetAside[];
  provenance: AiProvenance | null;
}

// Module-level singleton state, like the other generators: one result per helper, so the premise's proposals and the
// truths' proposals never mix.
const _state = createAiGenerationState();
const _results = ref<Partial<Record<CanonSuggestionMode, ModeResult>>>({});
const _generating = ref<CanonSuggestionMode | null>(null);
const _errorFor = ref<CanonSuggestionMode | null>(null);

/** Test seam: drop every stored result and in-flight marker. */
export function resetCanonSuggestions() {
  _results.value = {};
  _generating.value = null;
  _errorFor.value = null;
  _state.isGenerating.value = false;
  _state.error.value = null;
}

/**
 * The canon helpers (#1226 story 2): "Draft from a pitch" (`premise`) and "Suggest truths" (`truths`). Server-path
 * only, like Suggest connections: the world and the candidate knowers are service-role reads. Only PROPOSES; writing
 * an accepted entry is the caller's job, one at a time.
 */
export function useCanonSuggestions<M extends CanonSuggestionMode>(mode: M) {
  type S = Shapes[M];
  const campaign = useCampaignStore();

  async function suggest(steer: string): Promise<boolean> {
    if (isAnyAiGenerating.value) return false;
    _state.isGenerating.value = true;
    _state.error.value = null;
    _errorFor.value = mode;
    _generating.value = mode;
    const { [mode]: _dropped, ...others } = _results.value;
    _results.value = others;
    startAiQuotes();

    try {
      if (await textRunsOnLocalKey()) {
        throw new Error(
          "These suggestions need the server so they can draw on your campaign, and are not available in local-key mode. " +
          "Switch to platform credits or a campaign API key in Settings → AI.",
        );
      }
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign selected.");

      const { data, error } = await supabase.functions.invoke("suggest-canon", {
        body: { campaign_id: campaignId, mode, prompt: steer.trim() },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      if (data?.error) throw new Error(data.error);

      const result = data as CanonSuggestionsResponse<S>;
      const setAside = result.setAside ?? [];
      if (result.suggestions.length === 0 && setAside.length === 0) throw new Error("No usable suggestions. Try again.");
      _results.value = { ..._results.value, [mode]: { suggestions: result.suggestions, setAside, provenance: result.ai_provenance } };
      return true;
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Suggestion failed";
      return false;
    } finally {
      _state.isGenerating.value = false;
      _generating.value = null;
      stopAiQuotes();
    }
  }

  const mine = () => _results.value[mode];
  const suggestions = computed(() => (mine()?.suggestions ?? []) as S[]);
  const setAside = computed(() => mine()?.setAside ?? []);
  const provenance = computed(() => mine()?.provenance ?? null);
  const isGenerating = computed(() => _generating.value === mode);
  const error = computed(() => (_errorFor.value === mode ? _state.error.value : null));

  function dismiss(suggestion: S) {
    const current = mine();
    if (!current) return;
    _results.value = { ..._results.value, [mode]: { ...current, suggestions: current.suggestions.filter((s) => s !== suggestion) } };
  }

  function dismissAll() {
    const { [mode]: _dropped, ...others } = _results.value;
    _results.value = others;
    if (_errorFor.value === mode) _state.error.value = null;
  }

  return { suggest, suggestions, setAside, provenance, isGenerating, error, dismiss, dismissAll };
}
