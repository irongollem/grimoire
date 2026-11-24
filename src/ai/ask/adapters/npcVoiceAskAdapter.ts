/**
 * Ask Grimoire (#1270): lines an NPC could say, as a quote and a held result.
 *
 * The Voice tab's button opens this card for the NPC (the NPC as `target`), and words reach it too: "what would
 * @Johnny say if the guard stops him" is proposed to the same card with Johnny as the target. The price is the coach's
 * (`npc_voice_generation`), the call is its (`useNpcVoiceCoach`: a few lines, each checked against a disguise the NPC
 * still wears), and the gilt button charges at the generation. The lines are shown on the card, each with its own
 * "Said it", which files that one line as a thing the NPC said, to the NPC's Memory tab and DM-only until shared
 * there, exactly as the coach's "Said it" did: the running session, else the last one played. "Done" ends the card;
 * lines not marked are not kept, and "Again" asks for new ones at the quote's price.
 *
 * Each line is drawn as the NPC's speech bubble, with their portrait. "Said it" also says the line in the campaign chat
 * as the NPC, in the same bubble (an open message from the DM, marked as written by AI), so the table reads it too; a
 * "Speak aloud" button in the NPC's voice joins it later (#1273).
 *
 * A line is filed once and posted once: a second press on it finds each done, and a failed save or a failed post leaves
 * its button to press again, finishing only what is missing.
 */
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskPreviewAdapter, AskPreviewOutcome, AskPreviewRow, AskPreviewShown, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useAskGate } from "@/ai/ask/useAskGate";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { useNpcVoiceCoach } from "@/ai/useNpcVoiceCoach";
import { useCampaignStore } from "@/stores/campaign";
import { useNpcVoiceQuote } from "@/composables/ai/quotes/npcVoiceQuote";
import { useNpc } from "@/composables/npcs/useNpcs";
import { useCreateNpcMemory } from "@/composables/npcs/useNpcMemories";
import { useCampaignSession } from "@/composables/campaign/useCampaignSession";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { useSendNpcSpeech } from "@/composables/campaign/useSendNpcSpeech";
import { getNpcDisplayFocalPoint, getNpcDisplayName, getNpcDisplayPortrait } from "@/lib/npcDisplay";
import { getNpcPlayerFace } from "@/lib/npcPlayerFace";
import { defaultMemorySessionId } from "@/lib/npcs/npcMemories";
import type { NpcSpeechFace } from "@/lib/chat/npcSpeech";
import type { AiProvenance } from "@/ai/provenance";
import type { Npc } from "@/types/npc.types";

/** What a memory's body may hold. */
const MEMORY_BODY_LIMIT = 1000;

interface HeldLines {
  npc: Npc;
  lines: string[];
  reveals: boolean[];
  provenance: AiProvenance | null;
  /** The face the bubbles lead with, and the chat line carries: the portrait the table would see (a disguise's, while worn). */
  face: NpcSpeechFace;
}

export function useNpcVoiceAskAdapter(): AskPreviewAdapter {
  const campaign = useCampaignStore();
  const priceOf = useNpcVoiceQuote();
  const { blockFor } = useAskGate(null, "voice line");
  const coach = useNpcVoiceCoach();
  const createMemory = useCreateNpcMemory();
  const sendNpcSpeech = useSendNpcSpeech();
  const { session: openSession, isRunning } = useCampaignSession();

  // The NPC and the session log are read only once a proposal names an NPC: this adapter lives as long as the panel.
  const wantedId = ref("");
  const npcQuery = useNpc(wantedId);
  const { data: sessionLog } = useCampaignSessions({ enabled: () => wantedId.value !== "" });
  const reading = () => wantedId.value !== "" && npcQuery.data.value === undefined && !npcQuery.error.value;

  function understand(proposal: AskProposal) {
    wantedId.value = proposal.target?.type === "npc" ? proposal.target.id : "";
    return { npc: proposal.target?.type === "npc" ? npcQuery.data.value ?? null : null, situation: proposal.concept.trim() };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = priceOf();
    const name = read.npc ? (getNpcDisplayName(read.npc) ?? read.npc.name) : proposal.target?.name;
    const lines: AskQuoteLine[] = [
      ...(name ? [{ label: "For", value: name, credits: null }] : []),
      { label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null },
      ...priced.lines,
    ];
    let block = blockFor({ total: priced.total });
    if (!block && proposal.target?.type !== "npc") {
      block = { reason: "missing", message: "Say whose voice first." };
    } else if (!block && reading()) {
      block = { reason: "missing", message: "Still reading that NPC." };
    } else if (!block && read.npc === null) {
      block = { reason: "missing", message: npcQuery.error.value ? "That NPC could not be read." : "That NPC is not in this campaign." };
    } else if (!block && read.npc && !read.npc.campaign_id) {
      block = { reason: "missing", message: "This NPC has no campaign to take lines from." };
    }
    block = block ?? conceptBlock(read.situation, "voice line", { empty: "Say what is happening first.", limit: AI_PROMPT_LIMIT_SHORT, shorten: "situation" });
    return { lines, total: priced.total, block };
  }

  /** The running session, else the last one played; the log may still be loading, and then only the running one is known. */
  function filingSessionId(): string | null {
    const running = isRunning.value ? openSession.value : null;
    return sessionLog.value ? defaultMemorySessionId(running, sessionLog.value) : (running?.id ?? null);
  }

  function shown(held: HeldLines, said: (index: number) => AskPreviewRow["action"]): AskPreviewShown {
    const risky = held.reveals.flatMap((r, i) => (r ? [i + 1] : []));
    return {
      title: `${getNpcDisplayName(held.npc) ?? held.npc.name}, in their own words`,
      speaker: { name: getNpcDisplayName(held.npc) ?? held.npc.name, portrait: held.face.portrait, focal: held.face.focal },
      sections: [{
        heading: "Lines",
        hint: "Press Said it on what they said at the table: only those are kept, in their Memory tab.",
        rows: held.lines.map((text, i) => ({ label: `Line ${i + 1}`, detail: text, spoken: true as const, action: said(i) })),
      }],
      ...(risky.length > 0 ? { note: `${risky.length === 1 ? `Line ${risky[0]} may` : `Lines ${risky.join(", ")} may`} give the disguise away.` } : {}),
    };
  }

  async function preview(proposal: AskProposal): Promise<AskPreviewOutcome> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return { ok: false, result: failedRun("Lines", current.block.message) };
    const read = understand(proposal);
    if (read.npc === null) return { ok: false, result: failedRun("Lines", "That NPC could not be read.") };
    const npc = read.npc;

    await coach.suggest(npc, read.situation);
    if (coach.lines.value.length === 0) {
      return { ok: false, result: failedRun("Lines", coach.error.value ?? "No lines came back. Nothing was charged.") };
    }
    const held: HeldLines = { npc, lines: [...coach.lines.value], reveals: [...coach.reveals.value], provenance: coach.provenance.value, face: { portrait: getNpcDisplayPortrait(npc), focal: getNpcDisplayFocalPoint(npc) ?? null } };
    const parts: AskRunPart[] = [{ label: "Lines", ok: true, credits: spent(current.lines.find((l) => l.label === "Lines")) }];

    /** The lines already in the Memory tab and already said in the chat, so a second press never does either twice. */
    const filed = new Set<number>();
    const posted = new Set<number>();
    const filing = new Set<number>();

    /**
     * "Said it" on one line: files it once, DM-only, in the running session or the last played, with provenance, and
     * says it once in the chat as the NPC. When one half fails the other stays done and the press finishes the missing
     * half; the row says which failed.
     */
    async function fileLine(i: number): Promise<AskRunPart> {
      const label = `Line ${i + 1}`;
      if (filed.has(i) && posted.has(i)) return { label, ok: true, credits: 0 };
      if (filing.has(i)) return { label, ok: false, credits: 0, error: "Still being kept." };
      filing.add(i);
      try {
        if (!filed.has(i)) {
          try {
            await createMemory.mutateAsync({
              memory: {
                npc_id: npc.id,
                kind: "revealed",
                body: held.lines[i].trim().slice(0, MEMORY_BODY_LIMIT),
                session_id: filingSessionId(),
                party_member_ids: [],
                player_visible_to: [],
                ai_provenance: held.provenance,
              },
              npcLabel: getNpcDisplayName(npc) ?? npc.name,
            });
            filed.add(i);
          } catch (e) {
            return { label, ok: false, credits: 0, error: `Could not be kept${e instanceof Error ? `: ${e.message}` : "."}` };
          }
        }
        try {
          // The chat is read by players: the name and face they may see, not the DM's view of them.
          const seen = getNpcPlayerFace(npc);
          await sendNpcSpeech({ id: npc.id, name: seen.name ?? "???", face: { portrait: seen.portrait, focal: seen.focal } }, held.lines[i], held.provenance);
          posted.add(i);
        } catch (e) {
          return { label, ok: false, credits: 0, error: `Kept in their Memory tab, but the chat post failed${e instanceof Error ? `: ${e.message}` : "."} Press again to retry.` };
        }
        return { label, ok: true, credits: 0 };
      } finally {
        filing.delete(i);
      }
    }

    const rowAction = (i: number): AskPreviewRow["action"] => ({ label: "Said it", doneLabel: "Said", run: () => fileLine(i) });

    /** Done: ends the preview with what was kept. Lines not marked as said are not kept. */
    async function create(): Promise<AskRunResult> {
      if (filed.size === 0) return failedRun("Lines", "Press Said it on a line first, or Discard.");
      return {
        record: { type: "npc", id: npc.id, name: getNpcDisplayName(npc) ?? npc.name },
        route: `/npcs/${npc.id}`,
        parts: [{ label: `${filed.size === 1 ? "1 line" : `${filed.size} lines`} kept in their Memory tab`, ok: true, credits: 0 }],
      };
    }

    return { ok: true, preview: { shown: shown(held, rowAction), parts, create } };
  }

  return { id: "npc_voice", quote, preview };
}

export default useNpcVoiceAskAdapter;
