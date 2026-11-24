/**
 * Ask Grimoire (#1253, #1270): drafting a Scriptorium document, as a quote and a run.
 *
 * The Scriptorium's "Draft with AI" opens this card (`useOpenGenerator`), and the model may propose it too. The price is
 * the old dialog's (`useScriptoriumDraftQuote`), the gates are its (`useAskGate` with the `scriptorium_documents`
 * quota), and the run is its two steps: `generate` then `saveDraft` (`useGenerateScriptoriumDraft`).
 *
 * The draft is grounded in one record, so the proposal must name it. The card picks it by kind (`npc_id`,
 * `location_id`, `faction_id`, or `session_id` for a recap), so the id read is the one that matches what the draft is
 * about: a dossier is about a faction and a recap about a session whatever `subject_type` says, and only a handout
 * chooses. An id this campaign does not have is a "missing" block, never sent: the server would answer 404 after the
 * DM pressed the button.
 *
 * A paid draft whose save failed is kept by the part, and its retry only saves it again, free: the dialog's "Save
 * again" (its "Discard" is the DM's "Leave it" on the card).
 */
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { DraftAudience, DraftKind, DraftSubjectType } from "@edge-shared/scriptoriumDraft.ts";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { useChronicleSessionOptions } from "@/ai/ask/askSessionNotes";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useScriptoriumDraft } from "@/ai/useScriptoriumDraft";
import { isQuotaExceeded } from "@/lib/quotaError";
import { useCampaignStore } from "@/stores/campaign";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useScriptoriumDraftQuote } from "@/composables/ai/quotes/scriptoriumDraftQuote";
import { useSaveScriptoriumDraft, type KindedDraft } from "@/scriptorium/composables/useGenerateScriptoriumDraft";

const KINDS: readonly DraftKind[] = ["handout", "faction_dossier", "session_recap"];
const HANDOUT_SUBJECTS = ["npc", "location", "faction"] as const;
/** The contract input that holds the record each kind of subject is picked by. */
const SUBJECT_INPUT: Record<DraftSubjectType, string> = { npc: "npc_id", location: "location_id", faction: "faction_id", session: "session_id" };
const KIND_LABEL: Record<DraftKind, string> = {
  handout: "Player handout", faction_dossier: "Faction dossier", session_recap: "Session recap",
};
const SUBJECT_LABEL: Record<DraftSubjectType, string> = { npc: "NPC", location: "Location", faction: "Faction", session: "Session" };

function pick<T extends string>(options: readonly T[], value: string | null): T | null {
  return options.find((option) => option === value) ?? null;
}

export function useScriptoriumDraftAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const priceOf = useScriptoriumDraftQuote();
  const { blockFor } = useAskGate("scriptorium_documents", "document");
  const { generate, error: draftError } = useScriptoriumDraft();
  const { saveDraft } = useSaveScriptoriumDraft();

  // Only the list the proposal's subject lives in is read: this adapter lives as long as the panel.
  const wanted = ref<DraftSubjectType | null>(null);
  const { data: npcs } = useNpcs(() => wanted.value === "npc");
  const { data: locations } = useAllLocations(() => wanted.value === "location");
  const { data: factions } = useAllFactions(() => wanted.value === "faction");
  const sessions = useChronicleSessionOptions(() => wanted.value === "session");
  const loading = computed(() => {
    switch (wanted.value) {
      case "npc": return npcs.value === undefined;
      case "location": return locations.value === undefined;
      case "faction": return factions.value === undefined;
      case "session": return sessions.loading.value;
      case null: return false;
    }
  });

  function nameOf(type: DraftSubjectType, id: string): string | null {
    switch (type) {
      case "npc": return npcs.value?.find((n) => n.id === id)?.name ?? null;
      case "location": return locations.value?.find((l) => l.id === id)?.name ?? null;
      case "faction": return factions.value?.find((f) => f.id === id)?.name ?? null;
      // A recap is written about a chronicle entry: a note linked to a session.
      case "session": return sessions.options.value.find((o) => o.id === id)?.name ?? null;
    }
  }

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("scriptorium_draft", proposal.inputs);
    const kind = pick(KINDS, askString(inputs, "kind")) ?? "handout";
    // A dossier is about a faction and a recap about a session; only a handout chooses what it is about.
    const stated = pick(HANDOUT_SUBJECTS, askString(inputs, "subject_type"));
    const subjectType: DraftSubjectType | null = kind === "faction_dossier" ? "faction" : kind === "session_recap" ? "session" : stated;
    const subjectId = subjectType === null ? null : askString(inputs, SUBJECT_INPUT[subjectType]);
    wanted.value = subjectType !== null && subjectId !== null ? subjectType : null;
    const said = askString(inputs, "audience");
    // Audience follows the kind (a dossier is prep, the others are handed out) until the proposal says otherwise.
    const audience: DraftAudience = said === "dm" || said === "players" ? said : kind === "faction_dossier" ? "dm" : "players";
    return {
      kind,
      subjectType,
      subjectId,
      subjectName: wanted.value !== null && subjectId !== null ? nameOf(wanted.value, subjectId) : null,
      audience,
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = priceOf();

    const lines: AskQuoteLine[] = [
      { label: "Kind", value: KIND_LABEL[read.kind], credits: null },
    ];
    if (read.subjectType !== null && read.subjectName !== null) {
      lines.push({ label: SUBJECT_LABEL[read.subjectType], value: read.subjectName, credits: null });
    }
    lines.push({ label: "Written for", value: read.audience === "dm" ? "DM only, secrets included" : "Players, from what they can already see", credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);

    let block = blockFor({ total: priced.total });
    if (!block && (read.subjectType === null || read.subjectId === null)) {
      block = { reason: "missing", message: read.subjectType === null ? "Say who or what the handout is about first." : `Pick the ${read.subjectType === "npc" ? "NPC" : SUBJECT_LABEL[read.subjectType].toLowerCase()} first.` };
    } else if (!block && loading.value) {
      block = { reason: "missing", message: "Still reading this campaign's records." };
    } else if (!block && read.subjectName === null) {
      block = { reason: "missing", message: "That record is not in this campaign, so there is nothing to draft from." };
    } else if (!block && read.concept.length > AI_PROMPT_LIMIT) {
      block = { reason: "missing", message: `Shorten the description to ${AI_PROMPT_LIMIT} characters.` };
    }
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    const current = quote(proposal);
    if (current.block) return failedRun("Draft", current.block.message);
    const read = understand(proposal);
    if (read.subjectType === null || read.subjectId === null) return failedRun("Draft", "Say who or what the document is about first.");
    if (isAnyAiGenerating.value) return failedRun("Draft", "Another AI generation is already running. Try again when it finishes.");
    const credits = current.total === null ? 0 : current.total;

    const request = {
      kind: read.kind,
      subject: { type: read.subjectType, id: read.subjectId },
      audience: read.audience,
      prompt: read.concept,
    };
    const draft = await generate(request);
    if (!draft) return failedRun("Draft", draftError.value ?? "The draft could not be written. Nothing was charged.");
    // A retry files the draft in the campaign it was written for, whatever the DM has switched to since.
    const campaignId = campaign.activeCampaignId;
    const kinded = { ...draft, kind: read.kind };
    try {
      const created = await saveDraft(kinded, campaignId);
      return {
        record: { type: "other", id: created.id, name: created.title },
        route: `/scriptorium/${created.id}`,
        parts: [{ label: "Draft", ok: true, credits }],
      };
    } catch (e) {
      return { record: null, route: null, parts: [saveFailed(kinded, campaignId, credits, e)] };
    }
  }

  /** The paid draft whose save failed: the part says so and its retry saves the kept draft again, which costs nothing. */
  function saveFailed(draft: KindedDraft, campaignId: string | null, credits: number, cause: unknown): AskRunPart {
    const message = isQuotaExceeded(cause)
      ? "You have reached your limit of documents on this plan."
      : cause instanceof Error ? cause.message : "The draft could not be saved.";
    return {
      label: "Draft",
      ok: false,
      credits,
      error: `The draft was written but not saved: ${message}`,
      retry: {
        credits: 0,
        run: async () => {
          try {
            const created = await saveDraft(draft, campaignId);
            return { label: `Saved "${created.title}" to the Scriptorium`, ok: true, credits: 0 };
          } catch (e) {
            return saveFailed(draft, campaignId, credits, e);
          }
        },
      },
    };
  }

  return { id: "scriptorium_draft", quote, run };
}

export default useScriptoriumDraftAskAdapter;
