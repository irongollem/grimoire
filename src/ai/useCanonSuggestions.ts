import { computed, ref, toRaw } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type {
  ArcSuggestion,
  BackstorySuggestion,
  CanonSetAside,
  ClueSuggestion,
  ForceSuggestion,
  HabitatSuggestion,
  LoreKind,
  LoreSuggestion,
  PeopleSuggestion,
  PremiseSuggestion,
  QuestionSuggestion,
  SecretSuggestion,
  SpeciesSuggestion,
  SuggestedPremiseKind,
  TruthSuggestion,
} from "@edge-shared/canonSuggestions.ts";
import type { ReadFinding } from "@edge-shared/canonReadThrough.ts";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { isAnyAiGenerating } from "./aiGeneratorRegistry";
import type { AiProvenance } from "./provenance";
import { useCampaignStore } from "@/stores/campaign";

export type { ArcSuggestion, BackstorySuggestion, ClueSuggestion, ForceSuggestion, HabitatSuggestion, LoreSuggestion, PeopleSuggestion, PremiseSuggestion, QuestionSuggestion, ReadFinding, SecretSuggestion, SpeciesSuggestion, SuggestedPremiseKind, TruthSuggestion };

export type CanonSuggestionMode = "premise" | "truths" | "clues" | "questions" | "forces" | "lore" | "secrets" | "read" | "arcs" | "peoples" | "backstory" | "species" | "habitats";

interface Shapes {
  premise: PremiseSuggestion;
  truths: TruthSuggestion;
  clues: ClueSuggestion;
  questions: QuestionSuggestion;
  forces: ForceSuggestion;
  lore: LoreSuggestion;
  secrets: SecretSuggestion;
  arcs: ArcSuggestion;
  peoples: PeopleSuggestion;
  backstory: BackstorySuggestion;
  species: SpeciesSuggestion;
  habitats: HabitatSuggestion;
  /** Findings, not proposals: nothing in them can be accepted, and none is ever written. */
  read: ReadFinding;
}

/** What a mode sends besides the steer: the secret the clues are for, or the lore entry's title, kind and text. */
interface Inputs {
  /** Narrows the premise to these sections ("Enhance with AI" on one); absent drafts the whole starter. */
  premise: { kinds?: SuggestedPremiseKind[] };
  clues: { secret_id: string };
  backstory: { party_member_id: string };
  lore: { title: string; lore_kind?: LoreKind | null; text?: string };
}
type ExtraArgs<M extends CanonSuggestionMode> = M extends "premise" ? [input?: Inputs["premise"]] : M extends keyof Inputs ? [input: Inputs[M]] : [];

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
const _results = ref<Partial<Record<string, ModeResult>>>({});
const _generating = ref<string | null>(null);
const _errorFor = ref<string | null>(null);

/**
 * What an accepted proposal wrote, held beside the proposals so every review on one key shows the same state (the
 * Familiar's walk and a chapter). `undo` takes back exactly that write; null when it cannot be taken back safely.
 */
export interface KeptWrite {
  undo: (() => Promise<void>) | null;
}
// Compared through `toRaw` on both sides: a ref hands its contents back as proxies, the proposal arrives as either.
const _kept = ref<Record<string, { suggestion: object; write: KeptWrite }[]>>({});

/** Test seam: drop every stored result and in-flight marker. */
export function resetCanonSuggestions() {
  _results.value = {};
  _generating.value = null;
  _errorFor.value = null;
  _kept.value = {};
  _state.isGenerating.value = false;
  _state.error.value = null;
}

/**
 * The canon helpers (#1226 story 2): "Draft from a pitch" (`premise`) and "Suggest truths" (`truths`), then clues for a secret, open questions, forces, a lore draft, secrets with their clues, and "Read it through" (`read`). Server-path
 * only, like Suggest connections: the world and the candidate knowers are service-role reads. Only PROPOSES; writing
 * an accepted entry is the caller's job, one at a time.
 */
export function useCanonSuggestions<M extends CanonSuggestionMode>(mode: M, scope?: string) {
  type S = Shapes[M];
  // A scope keeps two mounts of one mode apart: a lore draft in the part and a split on an entry never share proposals.
  const key = scope ? `${mode}:${scope}` : mode;
  const campaign = useCampaignStore();

  async function suggest(steer: string, ...[input]: ExtraArgs<M>): Promise<boolean> {
    if (isAnyAiGenerating.value) return false;
    _state.isGenerating.value = true;
    _state.error.value = null;
    _errorFor.value = key;
    _generating.value = key;
    const { [key]: _dropped, ...others } = _results.value;
    _results.value = others;
    startAiQuotes();

    try {
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign selected.");

      const { data, error } = await supabase.functions.invoke("suggest-canon", {
        // A draft held under a walk scope is Design it with me's (#1282), which asks the helper for range to choose from.
        body: { campaign_id: campaignId, mode, prompt: steer.trim(), ...input, ...(scope?.startsWith("walk:") ? { walk: true } : {}) },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      if (data?.error) throw new Error(data.error);

      const result = data as CanonSuggestionsResponse<S>;
      const setAside = result.setAside ?? [];
      // A read that found nothing is an answer ("nothing to report"); for every other mode an empty reply is a failure.
      if (mode !== "read" && result.suggestions.length === 0 && setAside.length === 0) throw new Error("No usable suggestions. Try again.");
      _results.value = { ..._results.value, [key]: { suggestions: result.suggestions, setAside, provenance: result.ai_provenance } };
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

  const mine = () => _results.value[key];
  const suggestions = computed(() => (mine()?.suggestions ?? []) as S[]);
  const setAside = computed(() => mine()?.setAside ?? []);
  const provenance = computed(() => mine()?.provenance ?? null);
  const isGenerating = computed(() => _generating.value === key);
  /** A result is held for this key, even an empty one: "Read it through" ran and found nothing. */
  const hasResult = computed(() => mine() !== undefined);
  const error = computed(() => (_errorFor.value === key ? _state.error.value : null));

  const keptHere = () => _kept.value[key] ?? [];
  /** An accepted proposal stays in place, settled; `write.undo` is how it is taken back. */
  function markKept(suggestion: S, write: KeptWrite) {
    _kept.value = { ..._kept.value, [key]: [...keptHere().filter((k) => toRaw(k.suggestion) !== toRaw(suggestion)), { suggestion: toRaw(suggestion), write }] };
  }
  const isKept = (suggestion: S) => keptHere().some((k) => toRaw(k.suggestion) === toRaw(suggestion));
  const canUndo = (suggestion: S) => keptHere().some((k) => toRaw(k.suggestion) === toRaw(suggestion) && k.write.undo !== null);
  /** Reverses the write and puts the proposal back to pending. A failed undo throws and leaves it kept. */
  async function undoKept(suggestion: S): Promise<void> {
    const found = keptHere().find((k) => toRaw(k.suggestion) === toRaw(suggestion));
    if (!found?.write.undo) return;
    await found.write.undo();
    _kept.value = { ..._kept.value, [key]: keptHere().filter((k) => k !== found) };
  }

  function dismiss(suggestion: S) {
    const current = mine();
    if (!current) return;
    _results.value = { ..._results.value, [key]: { ...current, suggestions: current.suggestions.filter((s) => s !== suggestion) } };
  }

  function dismissAll() {
    const { [key]: _dropped, ...others } = _results.value;
    _results.value = others;
    if (_errorFor.value === key) _state.error.value = null;
  }

  return { suggest, suggestions, setAside, provenance, isGenerating, hasResult, error, dismiss, dismissAll, isKept, canUndo, markKept, undoKept };
}
