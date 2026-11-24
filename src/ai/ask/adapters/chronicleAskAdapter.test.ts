import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, affordable: true, lists: true }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" } }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1, affordable: () => state.affordable }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({ useCampaignProviders: () => ({ textCredits: (base: number) => base * 2 }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/composables/notes/useEntityMentionItems", () => ({
  useEntityMentionItems: () => ({
    npcs: { get value() { return state.lists ? [] : undefined; } },
    monsterIndex: { get value() { return state.lists ? [] : undefined; } },
    partyMembers: { get value() { return state.lists ? [] : undefined; } },
    factions: { get value() { return state.lists ? [] : undefined; } },
    locations: { get value() { return state.lists ? [] : undefined; } },
  }),
}));
vi.mock("@/composables/notes/useNotes", () => ({
  useNotes: () => ({ data: { get value() { return state.lists ? [{ tags: ["Heist", "Heist", "Sewer"] }, { tags: ["Heist"] }] : undefined; } } }),
}));
vi.mock("@/ai/useChroniclerTextGeneration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ai/useChroniclerTextGeneration")>()),
  useChroniclerTextGeneration: () => ({ generate: mocks.generate }),
}));

const { useChronicleAskAdapter } = await import("./chronicleAskAdapter");
const { provideNoteSurface } = await import("@/composables/notes/useNoteSurface");
const { useChronicleQuote } = await import("@/composables/ai/quotes/chronicleQuote");

const NOTE = "11111111-1111-4111-8111-111111111111";
const proposal = (over: Partial<AskProposal> = {}): AskProposal => ({
  proposalId: "p1", generator: "chronicle", concept: "Kira stabbed the duke and the party escaped via the sewer", inputs: {}, ...over,
});
const written = (chronicle = "# Session 4: The Duke's Blood\n\nKira struck.\n\nThey fled.\n\n[[tags: heist, sewer]]") => ({ chronicle, ai_provenance: { generatorType: "chronicle_text", provider: "openai", model: "m", generatedAt: "t", edited: false } });

let scope: EffectScope | null = null;
const surface = { id: NOTE as string | null, title: "", session: null as number | null, insertChronicle: vi.fn(), insertScene: vi.fn() };
/** Opens a note editor and returns its instance token, which a card opened from an unsaved note carries as its target. */
function openNote(): string {
  scope = effectScope();
  return scope.run(() => provideNoteSurface({ noteId: () => surface.id, title: () => surface.title, sessionNum: () => surface.session, insertChronicle: surface.insertChronicle, insertScene: surface.insertScene })) as string;
}

async function previewed(adapter: ReturnType<typeof useChronicleAskAdapter>, p: AskProposal) {
  const outcome = await adapter.preview(p);
  if (!outcome.ok) throw new Error(`expected a preview: ${outcome.result.parts[0].error}`);
  return outcome.preview;
}

describe("useChronicleAskAdapter", () => {
  beforeEach(() => {
    mocks.generate.mockReset().mockResolvedValue(written());
    surface.insertChronicle.mockReset();
    Object.assign(surface, { id: NOTE, title: "", session: null });
    Object.assign(state, { aiEnabled: true, affordable: true, lists: true });
    openNote();
  });
  afterEach(() => { scope?.stop(); scope = null; });

  it("quotes the same price the page showed, written by the campaign's text provider", () => {
    expect(useChronicleAskAdapter().quote(proposal()).total).toBe(useChronicleQuote()().total);
  });

  // Bug caught: a chronicle written with the AI off or the balance short, or from nothing, or from more than the server takes.
  it("blocks with AI off, a short balance, and an empty or overlong account of what happened, and writes nothing", async () => {
    const adapter = useChronicleAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({ concept: "  " })).block?.message).toBe("Say what happened first.");
    expect(adapter.quote(proposal({ concept: "x".repeat(3000) })).block).toBeNull();
    expect(adapter.quote(proposal({ concept: "x".repeat(3001) })).block?.reason).toBe("missing");
    const outcome = await adapter.preview(proposal({ concept: "  " }));
    expect(outcome.ok).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  // Bug caught: the chronicle written for a note that is not open, where Insert has nowhere to put it.
  it("blocks while no note is open, and while another note than the card's target is", () => {
    const adapter = useChronicleAskAdapter();
    expect(adapter.quote(proposal({ target: { type: "note", id: NOTE, name: "Session 4" } })).block).toBeNull();
    expect(adapter.quote(proposal({ target: { type: "note", id: "22222222-2222-4222-8222-222222222222", name: "Session 3" } })).block?.message).toContain("is not the note that is open");
    scope?.stop();
    expect(adapter.quote(proposal()).block?.message).toContain("Open the note");
  });

  // Bug caught: a chronicle for a note not saved yet being refused, though the dialog wrote into one.
  it("writes into a note that is not saved yet", async () => {
    surface.id = null;
    const adapter = useChronicleAskAdapter();
    expect(adapter.quote(proposal()).block).toBeNull();
    const preview = await previewed(adapter, proposal());
    const result = await preview.create();
    expect(result.record).toMatchObject({ type: "note" });
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ excludeNoteId: undefined }));
  });

  // Bug caught: the lists a mention is looked up in not having arrived, so "@Veyra" went to the model as plain text.
  it("waits for the campaign's people and tags before it quotes", () => {
    state.lists = false;
    expect(useChronicleAskAdapter().quote(proposal()).block?.message).toContain("Still reading");
  });

  // Bug caught: the dialog's inputs dropped on the way: the tone, the tag vocabulary (most used first), the note kept out of its own recap.
  it("writes from the facts with the tone, the campaign's tags most used first, and the note excluded from its own recap", async () => {
    await previewed(useChronicleAskAdapter(), proposal({ inputs: { tone: "humorous" } }));
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      rawText: "Kira stabbed the duke and the party escaped via the sewer", tone: "humorous", existingTags: ["Heist", "Sewer"], excludeNoteId: NOTE,
    }));
  });

  it("is dramatic when no tone was said, or a word that is not a tone", async () => {
    await previewed(useChronicleAskAdapter(), proposal({ inputs: { tone: "sad" } }));
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ tone: "dramatic" }));
  });

  // Bug caught: the model's title line left in the body while the note's title and session stayed empty (the dialog's own fix).
  it("shows the title, session and tags the model suggested, and the draft without them", async () => {
    const preview = await previewed(useChronicleAskAdapter(), proposal());
    expect(preview.shown.title).toBe("The Duke's Blood");
    const rows = preview.shown.sections[0].rows;
    expect(rows.find((r) => r.label === "Session")?.detail).toBe("Session 4");
    expect(rows.find((r) => r.label === "Tags")?.detail).toBe("Heist, Sewer");
    // The draft rides as prose for the card's viewer, whole, not one hint per paragraph.
    expect(preview.shown.body).toContain("Kira struck.");
    expect(preview.shown.body).toContain("They fled.");
    expect(preview.shown.sections).toHaveLength(1);
  });

  // Bug caught: a charge missing from the parts, so the folded line said nothing was spent.
  it("reports the writing's price as its part, and nothing goes into the note until Insert", async () => {
    const preview = await previewed(useChronicleAskAdapter(), proposal());
    expect(preview.parts).toEqual([{ label: "Chronicle", ok: true, credits: 2 }]);
    expect(surface.insertChronicle).not.toHaveBeenCalled();
  });

  it("inserts the chronicle exactly as the dialog's Insert did: the body without its title, the heading's title, session and tags, the provenance", async () => {
    const preview = await previewed(useChronicleAskAdapter(), proposal());
    const result = await preview.create();
    expect(surface.insertChronicle).toHaveBeenCalledWith({
      markdown: "Kira struck.\n\nThey fled.", title: "The Duke's Blood", sessionNum: 4, tags: ["Heist", "Sewer"],
      aiProvenance: expect.objectContaining({ generatorType: "chronicle_text" }),
    });
    expect(result.record).toMatchObject({ type: "note", id: NOTE });
    expect(result.route).toBeNull();
  });

  // Bug caught: the model's title written over the one the DM typed (the dialog kept theirs and offered the suggestion).
  it("keeps the title and session the note already has, and offers the suggestion as a choice", async () => {
    surface.title = "The Heist";
    surface.session = 3;
    const preview = await previewed(useChronicleAskAdapter(), proposal());
    expect(preview.shown.sections[0].rows[0]).toMatchObject({ detail: "The Heist", choice: { key: "suggestion", value: "own" } });
    await preview.create();
    expect(surface.insertChronicle).toHaveBeenLastCalledWith(expect.objectContaining({ title: "The Heist", sessionNum: 3 }));
    const shown = preview.choose?.("suggestion", "suggested");
    expect(shown?.sections[0].rows[0].detail).toBe("The Duke's Blood");
    await preview.create();
    expect(surface.insertChronicle).toHaveBeenLastCalledWith(expect.objectContaining({ title: "The Duke's Blood", sessionNum: 4 }));
  });

  it("offers no choice when the note has nothing the suggestion would replace", async () => {
    const preview = await previewed(useChronicleAskAdapter(), proposal());
    expect(preview.shown.sections[0].rows.some((r) => r.choice)).toBe(false);
  });

  // Bug caught: the DM leaving the note while the chronicle was on the card, and Insert pretending it had landed.
  it("keeps the paid chronicle on the card when the note is no longer open, and inserts once it is", async () => {
    const preview = await previewed(useChronicleAskAdapter(), proposal());
    scope?.stop();
    const refused = await preview.create();
    expect(refused.record).toBeNull();
    expect(refused.parts[0].error).toContain("Open the note");
    expect(surface.insertChronicle).not.toHaveBeenCalled();
    openNote();
    expect((await preview.create()).record).not.toBeNull();
    expect(surface.insertChronicle).toHaveBeenCalledTimes(1);
  });

  // Bug caught: the DM opening another note while the chronicle was on the card, and Insert writing it into that one.
  it("refuses to insert into a different note than the card's target", async () => {
    const preview = await previewed(useChronicleAskAdapter(), proposal({ target: { type: "note", id: NOTE, name: "Session 4" } }));
    surface.id = "22222222-2222-4222-8222-222222222222";
    const refused = await preview.create();
    expect(refused.record).toBeNull();
    expect(refused.parts[0].error).toContain("is not the note that is open");
    expect(surface.insertChronicle).not.toHaveBeenCalled();
  });

  // Bug caught: a card opened from an unsaved note had no target, so Insert wrote into whichever note editor was open
  // later: another note's title and session were replaced and the recap added to it.
  it("never inserts a card opened from an unsaved note into a different note's editor", async () => {
    surface.id = null;
    const first: EffectScope | null = scope;
    const token = openNote();
    const card = proposal({ target: { type: "note", id: token, name: "This note" } });
    const preview = await previewed(useChronicleAskAdapter(), card);
    // The DM closes that editor and opens another new note (a new editor instance) before pressing Insert.
    (scope as EffectScope | null)?.stop();
    first?.stop();
    openNote();
    const refused = await preview.create();
    expect(refused.record).toBeNull();
    expect(refused.parts[0].error).toContain("The note this was written for is closed.");
    expect(useChronicleAskAdapter().quote(card).block?.message).toBe("The note this was written for is closed.");
    expect(surface.insertChronicle).not.toHaveBeenCalled();
  });

  // Bug caught: the binding refusing the editor it came from once the note was saved, which keeps its instance.
  it("still inserts into the very editor the card came from after the note is saved", async () => {
    surface.id = null;
    const token = openNote();
    const preview = await previewed(useChronicleAskAdapter(), proposal({ target: { type: "note", id: token, name: "This note" } }));
    surface.id = "33333333-3333-4333-8333-333333333333";
    expect((await preview.create()).record).not.toBeNull();
    expect(surface.insertChronicle).toHaveBeenCalledTimes(1);
  });

  // Bug caught: a failed generation spending the DM's credits, or throwing out of the panel.
  it("ends with the reason and no preview when the writing fails", async () => {
    mocks.generate.mockRejectedValue(new Error("The writer is busy."));
    const outcome = await useChronicleAskAdapter().preview(proposal());
    expect(outcome).toMatchObject({ ok: false, result: { record: null, parts: [{ ok: false, error: "The writer is busy." }] } });
  });
});
