/**
 * Ask Grimoire (#1270): Write Chronicle, as a quote and a preview.
 *
 * A note's toolbar opens this card (`useOpenGenerator`, the note as `target`, none for a note not saved yet), and the
 * model may propose it for a note the DM has open. The chronicle is written from the DM's raw facts by
 * `useChroniclerTextGeneration` (the dialog's own call: @-mentions resolved to lore, the campaign's tag vocabulary and
 * the note excluded from its own recap), and the gilt button charges at the generation. The draft is shown on the card
 * before it goes anywhere, with the title, session number and tags the model suggested, and **Insert into note** puts it
 * in the open note exactly as the dialog's Insert did (`NoteSurface.insertChronicle`, the editor's own insert).
 *
 * The DM's own title and session win the fields, as in the dialog: the model's suggestion is one choice away
 * ("Use the suggestion") rather than written over what the DM typed. The dialog's editable title, session and tag
 * fields are not on the card: the note's own fields are the place to change them, and what lands is shown first.
 *
 * Insert needs the note to be open still. A chronicle that cannot be inserted (the DM left the note) stays on the card,
 * paid for, and Insert can be pressed again once the note is open.
 */
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskPreviewAdapter, AskPreviewOutcome, AskPreviewShown, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, matchOption, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { CHRONICLER_TONES, useChroniclerTextGeneration, type ChroniclerTone } from "@/ai/useChroniclerTextGeneration";
import { parseChronicleHeading } from "@/ai/chronicleHeading";
import { parseChronicleTags, reconcileChronicleTags } from "@/ai/chronicleTags";
import type { AiProvenance } from "@/ai/provenance";
import { useCampaignStore } from "@/stores/campaign";
import { useChronicleQuote } from "@/composables/ai/quotes/chronicleQuote";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { useNotes } from "@/composables/notes/useNotes";
import { currentNoteSurface } from "@/composables/notes/useNoteSurface";
import { noteSurfaceBlock } from "@/ai/ask/adapters/noteSurfaceKit";

/** What a fact-dump may run to: a full session's raw notes are longer than the other generators' prompts. */
const FACTS_MAX = 3000;
/** The campaign's note-tag vocabulary sent to the model, most frequent first. */
const TAGS_MAX = 150;

interface Draft {
  markdown: string;
  suggestedTitle: string | null;
  suggestedSession: number | null;
  tags: string[];
  provenance: AiProvenance | null;
}

export function useChronicleAskAdapter(): AskPreviewAdapter {
  const campaign = useCampaignStore();
  const priceOf = useChronicleQuote();
  const { blockFor } = useAskGate(null, "chronicle");
  const { generate } = useChroniclerTextGeneration();

  // The people, places and tags are read only once a chronicle is quoted: this adapter lives as long as the panel.
  const wanted = ref(false);
  const { npcs, monsterIndex, partyMembers, factions, locations } = useEntityMentionItems(() => wanted.value);
  const { data: notes } = useNotes(() => wanted.value);
  const loading = computed(() => wanted.value && [npcs.value, monsterIndex.value, partyMembers.value, factions.value, locations.value, notes.value].some((list) => list === undefined));

  /** The campaign's existing tags, most frequent first and capped: the model prefers reusing a tag to minting a twin. */
  function existingTags(): string[] {
    const frequency = new Map<string, number>();
    for (const note of notes.value ?? []) for (const tag of note.tags ?? []) frequency.set(tag, (frequency.get(tag) ?? 0) + 1);
    return [...frequency.entries()].sort(([, a], [, b]) => b - a).map(([tag]) => tag).slice(0, TAGS_MAX);
  }

  function understand(proposal: AskProposal) {
    wanted.value = true;
    const inputs = readAskInputs("chronicle", proposal.inputs);
    return {
      tone: matchOption<ChroniclerTone>(askString(inputs, "tone"), CHRONICLER_TONES.map((t) => ({ id: t.value, label: t.label }))) ?? "dramatic",
      facts: proposal.concept.trim(),
    };
  }

  /** The open note's editor when it is the card's own, else null: another note's title and session are never the card's. */
  function boundSurface(proposal: AskProposal) {
    return noteBlock(proposal) === null ? currentNoteSurface.value : null;
  }

  /** Why the open note cannot take a chronicle, or null: none open, or another note than the one the card is for. */
  function noteBlock(proposal: AskProposal): string | null {
    return noteSurfaceBlock(proposal, "write into");
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = priceOf();
    const surface = currentNoteSurface.value;
    const lines: AskQuoteLine[] = [
      { label: "Into", value: proposal.target?.name ?? (surface?.title().trim() || "This note"), credits: null },
      { label: "Tone", value: CHRONICLER_TONES.find((t) => t.value === read.tone)?.label ?? "Dramatic", credits: null },
      { label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null },
      ...priced.lines,
    ];

    let block = blockFor({ total: priced.total });
    block = block ?? conceptBlock(read.facts, "chronicle", { empty: "Say what happened first.", limit: FACTS_MAX, shorten: "notes" });
    const closed = noteBlock(proposal);
    if (!block && closed !== null) block = { reason: "missing", message: closed };
    if (!block && loading.value) block = { reason: "missing", message: "Still reading the people, places and tags it names." };
    return { lines, total: priced.total, block };
  }

  /** The draft as the card shows it, with the DM's choice between their own title and the suggestion applied. */
  function applied(proposal: AskProposal, draft: Draft, useSuggestion: boolean) {
    const surface = boundSurface(proposal);
    const ownTitle = surface?.title().trim() || null;
    const ownSession = surface?.sessionNum() ?? null;
    const title = useSuggestion ? (draft.suggestedTitle ?? ownTitle) : (ownTitle ?? draft.suggestedTitle);
    const sessionNum = useSuggestion ? (draft.suggestedSession ?? ownSession) : (ownSession ?? draft.suggestedSession);
    // Offered only where the note already has a title or session the suggestion would replace: a note with neither takes it.
    const hasSuggestion = (ownTitle !== null && draft.suggestedTitle !== null && draft.suggestedTitle !== ownTitle)
      || (ownSession !== null && draft.suggestedSession !== null && draft.suggestedSession !== ownSession);
    return { title, sessionNum, hasSuggestion, ownTitle, ownSession };
  }

  function shown(proposal: AskProposal, draft: Draft, useSuggestion: boolean): AskPreviewShown {
    const { title, sessionNum, hasSuggestion } = applied(proposal, draft, useSuggestion);
    const suggestion = [draft.suggestedSession !== null ? `Session ${draft.suggestedSession}` : null, draft.suggestedTitle].filter((p) => p !== null).join(": ");
    const note = boundSurface(proposal);
    const rows = [
      { label: "Note title", detail: title ?? "Unchanged", ...(hasSuggestion ? { choice: { key: "suggestion", label: "Suggested", options: [{ id: "own", name: "Keep what the note has" }, { id: "suggested", name: `Use: ${suggestion}` }], value: useSuggestion ? "suggested" : "own" } } : {}) },
      { label: "Session", detail: sessionNum === null ? "Unchanged" : `Session ${sessionNum}` },
      { label: "Tags", detail: draft.tags.length > 0 ? draft.tags.join(", ") : "None suggested" },
    ];
    return {
      title: title ?? note?.title().trim() ?? "Chronicle",
      // The draft itself, as the note will hold it: the card's sanitized viewer sets its headings and emphasis.
      body: draft.markdown,
      sections: [{ rows }],
    };
  }

  async function preview(proposal: AskProposal): Promise<AskPreviewOutcome> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return { ok: false, result: failedRun("Chronicle", current.block.message) };
    const read = understand(proposal);

    let written;
    try {
      written = await generate({
        rawText: read.facts,
        tone: read.tone,
        npcs: npcs.value,
        monsterIndex: monsterIndex.value,
        partyMembers: partyMembers.value,
        factions: factions.value,
        locations: locations.value,
        existingTags: existingTags(),
        // The note the chronicle goes into, so retrieval never returns the very note being written (#600).
        excludeNoteId: currentNoteSurface.value?.noteId() ?? undefined,
      });
    } catch (e) {
      return { ok: false, result: failedRun("Chronicle", e instanceof Error ? e.message : "The chronicle could not be written. Nothing was charged.") };
    }
    const heading = parseChronicleHeading(written.chronicle);
    const parsedTags = parseChronicleTags(heading.body);
    const draft: Draft = {
      markdown: parsedTags.body,
      suggestedTitle: heading.title,
      suggestedSession: heading.sessionNum,
      tags: reconcileChronicleTags(parsedTags.tags, existingTags()),
      provenance: written.ai_provenance ?? null,
    };
    const parts = [{ label: "Chronicle", ok: true, credits: spent(current.lines.find((l) => l.label === "Chronicle")) }];

    let useSuggestion = false;

    async function create(): Promise<AskRunResult> {
      const surface = currentNoteSurface.value;
      const closed = noteBlock(proposal);
      if (surface === null || closed !== null) return failedRun("Chronicle", `${closed ?? "Open the note first."} The chronicle stays here: copy it, or open that note and press Create again.`);
      const { title, sessionNum } = applied(proposal, draft, useSuggestion);
      surface.insertChronicle({ markdown: draft.markdown, title, sessionNum, tags: draft.tags, aiProvenance: draft.provenance });
      return { record: { type: "note", id: surface.noteId() ?? "unsaved", name: title ?? "Chronicle" }, route: null, parts: [{ ...parts[0], label: "Inserted into the note. Save the note to keep it." }] };
    }

    function choose(key: string, value: string): AskPreviewShown {
      if (key === "suggestion") useSuggestion = value === "suggested";
      return shown(proposal, draft, useSuggestion);
    }

    return { ok: true, preview: { shown: shown(proposal, draft, useSuggestion), parts, create, choose } };
  }

  return { id: "chronicle", quote, preview };
}

export default useChronicleAskAdapter;
