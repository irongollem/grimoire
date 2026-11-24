/**
 * Ask Grimoire (#1253): painting a picture for an existing NPC, party member, monster, item or spell.
 *
 * A `fill`: the target is `proposal.target` (the server already checked it belongs to this campaign; this reads it
 * again, scoped to the campaign, because the quote must say whether a picture is being replaced). The price is
 * `usePortraitQuote`'s, the flow is `useMissingPortrait(kind)`, the one the Mint and Card Forge paint with, so the art
 * lands where an edit in the record's own page would put it. The prompt is the same one they build
 * (`entityImageContext`), not the DM's sentence: the picture is of the record, and the sentence only picked it.
 *
 * Only the DM's own rows are paintable; a record this campaign does not have is a "missing" block.
 */
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { useAskGate } from "@/ai/ask/useAskGate";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useMissingPortrait, type PortraitKind } from "@/ai/useMissingPortrait";
import { useCampaignStore } from "@/stores/campaign";
import { usePortraitQuote } from "@/composables/ai/quotes/portraitQuote";
import { usePortraitSubject, type PortraitSubject, type PortraitTarget } from "@/composables/ai/usePortraitSubject";

const KIND_OF: Record<string, PortraitKind | undefined> = {
  npc: "npc", party_member: "party", monster: "monster", item: "item", spell: "spell",
};

/** Where each kind's own page lives. */
function routeFor(kind: PortraitKind, id: string): string {
  switch (kind) {
    case "npc": return `/npcs/${id}`;
    case "party": return `/party/${id}`;
    case "monster": return `/monsters/${id}`;
    case "item": return `/vault/${id}`;
    case "spell": return `/spells/${id}`;
  }
}

const RECORD_TYPE = { npc: "npc", party: "party_member", monster: "monster", item: "item", spell: "spell" } as const;

export function usePortraitAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const priceOf = usePortraitQuote();
  const { blockFor } = useAskGate(null, "portrait");
  const painters: Record<PortraitKind, ReturnType<typeof useMissingPortrait>> = {
    npc: useMissingPortrait("npc"),
    party: useMissingPortrait("party"),
    monster: useMissingPortrait("monster"),
    item: useMissingPortrait("item"),
    spell: useMissingPortrait("spell"),
  };

  // Read only once a proposal names a target: this adapter lives as long as the panel, which is on every page.
  const wanted = ref<PortraitTarget | null>(null);
  const subjectQuery = usePortraitSubject(wanted);

  function targetOf(proposal: AskProposal): PortraitTarget | null {
    const kind = proposal.target ? KIND_OF[proposal.target.type] : undefined;
    return proposal.target && kind ? { kind, id: proposal.target.id } : null;
  }

  /** The subject for this proposal's target: undefined while it loads, null when there is none. */
  function subjectFor(target: PortraitTarget | null): PortraitSubject | null | undefined {
    if (target === null) return null;
    wanted.value = target;
    return subjectQuery.data.value;
  }

  function quote(proposal: AskProposal): AskQuote {
    const target = targetOf(proposal);
    const read = subjectFor(target);
    const priced = priceOf({ replaces: !!read && read.hasPicture });

    const lines: AskQuoteLine[] = [];
    if (read) lines.push({ label: "For", value: read.name, credits: null });
    else if (proposal.target) lines.push({ label: "For", value: proposal.target.name, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);

    let block = blockFor({ total: priced.total });
    if (!block && !target) {
      block = { reason: "missing", message: "Say whose portrait to paint first." };
    } else if (!block && read === undefined && subjectQuery.error.value) {
      block = { reason: "missing", message: "That record could not be read." };
    } else if (!block && read === undefined) {
      block = { reason: "missing", message: "Still reading that record." };
    } else if (!block && read === null) {
      block = { reason: "missing", message: "That record is not in this campaign, so there is nothing to paint." };
    } else if (!block && read && read.context.trim() === "") {
      block = { reason: "missing", message: "There is nothing written about them to paint from yet." };
    }
    return { lines, total: priced.total, block };
  }

  async function paintPart(subjectRead: PortraitSubject, credits: number): Promise<AskRunPart> {
    const painter = painters[subjectRead.kind];
    const url = await painter.paint(subjectRead.id, subjectRead.context);
    if (url) return { label: "Portrait", ok: true, credits };
    return {
      label: "Portrait",
      ok: false,
      credits: 0,
      error: painter.error.value ?? "The portrait could not be painted.",
      retry: { credits: painter.cost.value, run: () => paintPart(subjectRead, credits) },
    };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    const current = quote(proposal);
    if (current.block) return failedRun("Portrait", current.block.message);
    const target = targetOf(proposal);
    const read = subjectFor(target);
    if (!read) return failedRun("Portrait", "That record could not be read.");
    if (isAnyAiGenerating.value || painters[read.kind].isPaintingAny.value) {
      return failedRun("Portrait", "Another picture is being painted. Try again when it finishes.");
    }
    const credits = current.total === null ? 0 : current.total;

    const part = await paintPart(read, credits);
    return {
      record: part.ok ? { type: RECORD_TYPE[read.kind], id: read.id, name: read.name } : null,
      route: part.ok ? routeFor(read.kind, read.id) : null,
      parts: [part],
    };
  }

  return { id: "portrait", quote, run };
}

export default usePortraitAskAdapter;
