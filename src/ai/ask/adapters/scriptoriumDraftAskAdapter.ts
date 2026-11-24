/**
 * Ask Grimoire (#1253): drafting a Scriptorium document, as a quote and a run.
 *
 * The price is the dialog's (`useScriptoriumDraftQuote`), the gates are the dialog's (`useAskGate` with the
 * `scriptorium_documents` quota, plus the local-key refusal `useScriptoriumDraft` throws), and the run is the dialog's
 * two steps: `generate` then `saveDraft` (`useGenerateScriptoriumDraft`).
 *
 * The draft is grounded in one record, so the proposal must name it: a subject type and id the model took from the
 * campaign. An id this campaign does not have is a "missing" block, never sent: the server would answer 404 after the
 * DM pressed the button.
 *
 * A paid draft whose save failed is not retried here: the part says so, and the DM drafts again from the dialog, which
 * keeps such a draft for a free save.
 */
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { DraftAudience, DraftKind, DraftSubjectType } from "@edge-shared/scriptoriumDraft.ts";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useScriptoriumDraft } from "@/ai/useScriptoriumDraft";
import { isQuotaExceeded } from "@/lib/quotaError";
import { useCampaignStore } from "@/stores/campaign";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useNotes } from "@/composables/notes/useNotes";
import { useScriptoriumDraftQuote } from "@/composables/ai/quotes/scriptoriumDraftQuote";
import { useSaveScriptoriumDraft } from "@/scriptorium/composables/useGenerateScriptoriumDraft";

const KINDS: readonly DraftKind[] = ["handout", "faction_dossier", "session_recap"];
const SUBJECT_TYPES: readonly DraftSubjectType[] = ["npc", "location", "faction", "session"];
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
  const { data: notes } = useNotes(() => wanted.value === "session");
  const loading = computed(() => {
    switch (wanted.value) {
      case "npc": return npcs.value === undefined;
      case "location": return locations.value === undefined;
      case "faction": return factions.value === undefined;
      case "session": return notes.value === undefined;
      case null: return false;
    }
  });

  function nameOf(type: DraftSubjectType, id: string): string | null {
    switch (type) {
      case "npc": return npcs.value?.find((n) => n.id === id)?.name ?? null;
      case "location": return locations.value?.find((l) => l.id === id)?.name ?? null;
      case "faction": return factions.value?.find((f) => f.id === id)?.name ?? null;
      // A recap is written about a chronicle entry: a note linked to a session.
      case "session": return notes.value?.find((n) => n.id === id && n.session_id !== null)?.title ?? null;
    }
  }

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("scriptorium_draft", proposal.inputs);
    const kind = pick(KINDS, askString(inputs, "kind")) ?? "handout";
    // A dossier is about a faction and a recap about a session; only a handout chooses what it is about.
    const stated = pick(SUBJECT_TYPES, askString(inputs, "subject_type"));
    // A handout may be about an NPC, a place or a faction, never a session.
    const subjectType: DraftSubjectType | null = kind === "faction_dossier" ? "faction" : kind === "session_recap" ? "session" : stated === "session" ? null : stated;
    const subjectId = askString(inputs, "subject_id");
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
    lines.push({ label: "Written for", value: read.audience === "dm" ? "DM only" : "Players", credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);

    let block = blockFor({ total: priced.total });
    if (!block && (read.subjectType === null || read.subjectId === null)) {
      block = { reason: "missing", message: "Say who or what the document is about first." };
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
    try {
      const created = await saveDraft({ ...draft, kind: read.kind }, campaign.activeCampaignId);
      return {
        record: { type: "other", id: created.id, name: created.title },
        route: `/scriptorium/${created.id}`,
        parts: [{ label: "Draft", ok: true, credits }],
      };
    } catch (e) {
      const message = isQuotaExceeded(e)
        ? "You have reached your limit of documents on this plan."
        : e instanceof Error ? e.message : "The draft could not be saved.";
      // The draft was paid for and is lost to this panel; the dialog keeps one for a free retry, so say what happened.
      return { record: null, route: null, parts: [{ label: "Draft", ok: false, credits, error: `The draft was written but not saved: ${message}` }] };
    }
  }

  return { id: "scriptorium_draft", quote, run };
}

export default useScriptoriumDraftAskAdapter;
