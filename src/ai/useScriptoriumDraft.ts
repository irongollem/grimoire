import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type { AiProvenance } from "@/ai/provenance";
import type {
  DraftAudience,
  DraftKind,
  DraftSubjectType,
} from "@edge-shared/scriptoriumDraft.ts";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { localKeyModeChosen } from "@/lib/localKeyVault";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Document",
  entityRoute: (id) => `/scriptorium/${id}`,
  openPanel: () => {
    useUiStore().scriptoriumDraftOpen = true;
  },
});

export interface ScriptoriumDraftRequest {
  kind: DraftKind;
  subject: { type: DraftSubjectType; id: string };
  audience: DraftAudience;
  prompt?: string;
}

export interface ScriptoriumDraft {
  title: string;
  html: string;
  ai_provenance: AiProvenance;
}

/**
 * Drafts a Scriptorium document from campaign data (epic #910, S12).
 *
 * Server-path only: the draft is grounded in rows (and, for players, in what
 * they may see) that only the edge function's service-role client reads, and
 * BYOK-local is a legacy tier that new AI features do not ship a weaker second
 * path for. Creating the document from the returned draft is the dialog's job.
 */
export function useScriptoriumDraft() {
  const campaign = useCampaignStore();

  async function generate(request: ScriptoriumDraftRequest): Promise<ScriptoriumDraft | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    try {
      if (localKeyModeChosen()) {
        throw new Error(
          "Drafting reads your campaign on the server, so it is not available in local-key mode. " +
          "Switch to platform credits or a campaign API key in Settings → AI.",
        );
      }
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign selected.");

      const { data, error } = await supabase.functions.invoke("draft-scriptorium-document", {
        body: {
          campaign_id: campaignId,
          kind: request.kind,
          subject: request.subject,
          audience: request.audience,
          prompt: request.prompt?.trim() ?? "",
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      if (data?.error) throw new Error(data.error);

      const draft = data as ScriptoriumDraft;
      if (typeof draft.title !== "string" || typeof draft.html !== "string" || !draft.html.trim()) {
        throw new Error("The AI returned an empty document. Please try again.");
      }
      return draft;
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  return { ..._state, generate };
}
