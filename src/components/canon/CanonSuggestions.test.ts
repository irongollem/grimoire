import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { ClueSuggestion, ForceSuggestion, LoreSuggestion, PremiseSuggestion, QuestionSuggestion, TruthSuggestion } from "@/ai/useCanonSuggestions";
import type { CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createClue: vi.fn(),
  update: vi.fn(),
  nameKnower: vi.fn(),
  acceptForce: vi.fn(),
  loreDraft: vi.fn(),
  loreSplit: vi.fn(),
  suggest: vi.fn(),
  dismiss: vi.fn(),
  dismissAll: vi.fn(),
  confirm: vi.fn(),
  toastError: vi.fn(),
  aiEnabled: { value: true },
}));
const suggestions = ref<(PremiseSuggestion | TruthSuggestion | ClueSuggestion | QuestionSuggestion | ForceSuggestion | LoreSuggestion)[]>([]);
const setAside = ref<{ claim: string; reason: string }[]>([]);
const provenance = ref<{ generatorType: string } | null>({ generatorType: "canon_premise_suggestion" });

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get isAiEnabled() { return mocks.aiEnabled.value; } }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCreateCanonEntry: () => ({ mutateAsync: mocks.create }),
  useUpdateCanonEntry: () => ({ mutateAsync: mocks.update }),
}));
const existingClues = ref<{ secret_id: string; passage_id?: string | null }[]>([]);
vi.mock("@/composables/canon/useCanonClues", () => ({
  useCreateCanonClue: () => ({ mutateAsync: mocks.createClue }),
  useCanonClues: () => ({ data: existingClues }),
}));
const passages = ref<{ id: string; entry_id: string; sort_order: number; told_at?: string | null }[]>([]);
vi.mock("@/composables/canon/useCanonPassages", () => ({ useCanonPassages: () => ({ data: passages }) }));
vi.mock("@/composables/canon/useAcceptLore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/canon/useAcceptLore")>()),
  useAcceptLore: () => ({ draft: mocks.loreDraft, split: mocks.loreSplit }),
}));
vi.mock("@/composables/canon/useCanonForces", () => ({ useAcceptForce: () => mocks.acceptForce }));
vi.mock("@/composables/canon/useKnownTo", () => ({ useKnownTo: () => ({ nameKnower: mocks.nameKnower }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1 }) }));
vi.mock("@/composables/ai/useGenerationGate", () => ({ useGenerationGate: () => ({ canSpend: () => true }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({ useCampaignProviders: () => ({ textCredits: (n: number) => n, textIsByok: ref(false) }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/ai/useCanonSuggestions", () => ({
  useCanonSuggestions: () => ({
    suggest: mocks.suggest,
    suggestions,
    setAside,
    provenance,
    isGenerating: ref(false),
    error: ref(null),
    dismiss: mocks.dismiss,
    dismissAll: mocks.dismissAll,
  }),
}));

import CanonSuggestions from "./CanonSuggestions.vue";

const entry = (over: Partial<CanonEntry>): CanonEntry => canonEntry({ campaign_id: "c1", part: "premise", premise_kind: "theme", ...over });

type Lore = { title: string; kind: null; entryId: string | null; text: string };
function mountIt(mode: "premise" | "truths" | "clues" | "questions" | "forces" | "lore", entries: CanonEntry[] = [], secretId: string | null = null, lore: Lore | null = null) {
  return mount(CanonSuggestions, { props: { mode, entries, secretId, lore }, global: { stubs: { CanonRef: true, GenerationCostBadge: true } } });
}
const click = async (w: ReturnType<typeof mountIt>, label: string) => {
  await w.findAll("button").find((b) => b.text() === label)!.trigger("click");
  await flushPromises();
};

beforeEach(() => {
  for (const m of [mocks.create, mocks.createClue, mocks.update, mocks.nameKnower, mocks.acceptForce, mocks.loreDraft, mocks.loreSplit, mocks.suggest, mocks.dismiss, mocks.dismissAll, mocks.confirm, mocks.toastError]) m.mockReset();
  mocks.aiEnabled.value = true;
  mocks.create.mockResolvedValue({ id: "new1" });
  mocks.confirm.mockResolvedValue(true);
  mocks.acceptForce.mockResolvedValue(undefined);
  mocks.createClue.mockResolvedValue({ id: "clue1" });
  existingClues.value = [];
  passages.value = [];
  suggestions.value = [];
  setAside.value = [];
});

describe("CanonSuggestions", () => {
  it("renders nothing when AI is off for the campaign, so no spend can start", () => {
    mocks.aiEnabled.value = false;
    expect(mountIt("premise").find("button").exists()).toBe(false);
  });

  it("writes nothing when the proposals arrive; only Accept writes", () => {
    suggestions.value = [{ kind: "theme", text: "Mercy" }];
    const w = mountIt("premise");
    expect(w.text()).toContain("Mercy");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("Dismiss removes the proposal and writes nothing", async () => {
    const s: PremiseSuggestion = { kind: "theme", text: "Mercy" };
    suggestions.value = [s];
    const w = mountIt("premise");
    await click(w, "Dismiss");
    expect(mocks.dismiss).toHaveBeenCalledWith(s);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("accepts a theme as a new premise entry carrying the run's provenance", async () => {
    suggestions.value = [{ kind: "theme", text: "Mercy" }];
    const w = mountIt("premise", [entry({ id: "t0", premise_kind: "theme" })]);
    await click(w, "Accept");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      part: "premise", premise_kind: "theme", title: "Mercy", sort_order: 1, ai_provenance: { generatorType: "canon_premise_suggestion" },
    }));
  });

  it("asks before replacing an existing pitch, and updates that row rather than adding a second", async () => {
    suggestions.value = [{ kind: "pitch", text: "A drowned kingdom." }];
    const w = mountIt("premise", [entry({ id: "p1", premise_kind: "pitch" })]);
    await click(w, "Accept");
    expect(mocks.confirm).toHaveBeenCalledWith(
      "This will replace “x” with “A drowned kingdom.”; are you sure?",
      expect.anything(),
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ id: "p1", patch: expect.objectContaining({ body: expect.stringContaining("A drowned kingdom."), ai_provenance: expect.anything() }) });
  });

  // Bug caught: replacing a voice patched only the title, so an old body was read together with the new text.
  it("clears the old body when a suggested voice replaces an existing one, and leaves a pitch's title alone", async () => {
    suggestions.value = [{ kind: "voice", text: "Dry and warm." }];
    await click(mountIt("premise", [entry({ id: "v1", premise_kind: "voice" })]), "Accept");
    expect(mocks.update).toHaveBeenCalledWith({ id: "v1", patch: expect.objectContaining({ title: "Dry and warm.", body: null }) });
    mocks.update.mockClear();
    suggestions.value = [{ kind: "pitch", text: "A drowned kingdom." }];
    await click(mountIt("premise", [entry({ id: "p1", premise_kind: "pitch" })]), "Accept");
    expect(mocks.update.mock.calls[0][0].patch).not.toHaveProperty("title");
  });

  it("writes nothing when the DM declines the replacement, and keeps the proposal", async () => {
    mocks.confirm.mockResolvedValue(false);
    suggestions.value = [{ kind: "voice", text: "Dry and warm." }];
    const w = mountIt("premise", [entry({ id: "v1", premise_kind: "voice" })]);
    await click(w, "Accept");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.dismiss).not.toHaveBeenCalled();
  });

  it("accepting a truth creates it with its mark, then names each knower", async () => {
    suggestions.value = [{ title: "The bell tolls for the drowned", knowledge: "some", knowers: [{ kind: "npc", id: "n1", name: "Mara Voss" }, { kind: "faction", id: "f1", name: "The Iron Concord" }] }];
    const w = mountIt("truths");
    await click(w, "Accept");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ part: "truth", knowledge: "some", title: "The bell tolls for the drowned" }));
    expect(mocks.nameKnower).toHaveBeenCalledTimes(2);
    // The tie carries the run's provenance too, as every accepted AI link does.
    expect(mocks.nameKnower).toHaveBeenCalledWith("new1", { kind: "npc", id: "n1", name: "Mara Voss" }, expect.objectContaining({ generatorType: expect.any(String) }));
  });

  it("names nobody when the truth could not be created", async () => {
    mocks.create.mockRejectedValue(new Error("boom"));
    suggestions.value = [{ title: "T", knowledge: "some", knowers: [{ kind: "npc", id: "n1", name: "Mara" }] }];
    const w = mountIt("truths");
    await click(w, "Accept");
    expect(mocks.nameKnower).not.toHaveBeenCalled();
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("boom");
  });

  it("shows a refused claim as set aside", () => {
    setAside.value = [{ claim: "No war", reason: "lines are agreed at the table" }];
    expect(mountIt("premise").text()).toContain('Set aside: "No war". Lines are agreed at the table.');
  });

  describe("clues for a secret", () => {
    const clue = (kind: ClueSuggestion["spot"]["kind"]): ClueSuggestion => ({ title: "A scarecrow in the old guild colours", spot: { kind, id: "x1", name: "The Mint Fields" } });
    const COLUMNS = ["location_id", "npc_id", "quest_beat_id"] as const;

    it.each([["location", "location_id"], ["npc", "npc_id"], ["quest_beat", "quest_beat_id"]] as const)(
      "accepting a clue at a %s sets %s and no other place column, so a clue is never filed at two places",
      async (kind, column) => {
        suggestions.value = [clue(kind)];
        existingClues.value = [{ secret_id: "s1" }, { secret_id: "other" }];
        const w = mountIt("clues", [], "s1");
        await click(w, "Accept");
        expect(mocks.createClue).toHaveBeenCalledTimes(1);
        const written = mocks.createClue.mock.calls[0][0];
        expect(written).toMatchObject({ secret_id: "s1", title: "A scarecrow in the old guild colours", sort_order: 1, [column]: "x1" });
        for (const other of COLUMNS.filter((c) => c !== column)) expect(written).not.toHaveProperty(other);
        expect(mocks.create).not.toHaveBeenCalled();
      },
    );

    it("carries the run's provenance on the accepted clue", async () => {
      suggestions.value = [clue("npc")];
      await click(mountIt("clues", [], "s1"), "Accept");
      expect(mocks.createClue.mock.calls[0][0].ai_provenance).toEqual({ generatorType: "canon_premise_suggestion" });
    });

    it("Dismiss writes no clue", async () => {
      const c = clue("location");
      suggestions.value = [c];
      await click(mountIt("clues", [], "s1"), "Dismiss");
      expect(mocks.dismiss).toHaveBeenCalledWith(c);
      expect(mocks.createClue).not.toHaveBeenCalled();
    });

    it("asks the model about the secret it is mounted on", async () => {
      mocks.suggest.mockResolvedValue(true);
      const w = mountIt("clues", [], "s1");
      await click(w, "Place clues");
      // The steer box is open now: the button that runs it shares the opener's label and comes after it.
      await w.findAll("button").filter((b) => b.text() === "Place clues").at(-1)!.trigger("click");
      await flushPromises();
      expect(mocks.suggest).toHaveBeenCalledWith("", { secret_id: "s1" });
    });
  });

  describe("open questions", () => {
    it("accepting a question creates a question entry with the run's provenance and the next place in the list", async () => {
      suggestions.value = [{ title: "Who made the Stain?" }];
      await click(mountIt("questions", [entry({ part: "question", premise_kind: null })]), "Accept");
      expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
        part: "question", title: "Who made the Stain?", sort_order: 1, ai_provenance: { generatorType: "canon_premise_suggestion" },
      }));
      expect(mocks.createClue).not.toHaveBeenCalled();
    });

    it("Dismiss writes nothing", async () => {
      suggestions.value = [{ title: "Who made the Stain?" }];
      await click(mountIt("questions"), "Dismiss");
      expect(mocks.create).not.toHaveBeenCalled();
    });
  });

  describe("forces", () => {
    const force: ForceSuggestion = {
      title: "The Ferrymen",
      who: { kind: "faction", id: "fa1", name: "The Ferrymen" },
      wants: "the river to themselves",
      steps: ["The toll is a true sentence."],
      clockSize: 4,
      quests: [{ id: "q1", title: "The Souring" }],
    };

    it("shows what the force wants, its clock and its quests, and writes nothing until Accept", () => {
      suggestions.value = [force];
      const w = mountIt("forces");
      expect(w.text()).toContain("The Ferrymen wants the river to themselves");
      expect(w.text()).toContain("A clock of 4, 1 step, in The Souring.");
      expect(mocks.acceptForce).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("accepting hands the force, the run's provenance and the next place in the list to the writer, and dismisses it", async () => {
      suggestions.value = [force];
      await click(mountIt("forces", [entry({ part: "force", premise_kind: null }), entry({ id: "t", part: "truth", premise_kind: null })]), "Accept");
      expect(mocks.acceptForce).toHaveBeenCalledWith(force, { generatorType: "canon_premise_suggestion" }, 1);
      expect(mocks.dismiss).toHaveBeenCalledWith(force);
      // A force is never written as a question, which is what a suggestion with no mark and no spot would otherwise be.
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("keeps the proposal and tells the DM when the writing fails", async () => {
      mocks.acceptForce.mockRejectedValue(new Error("boom"));
      suggestions.value = [force];
      await click(mountIt("forces"), "Accept");
      expect(mocks.dismiss).not.toHaveBeenCalled();
      expect(mocks.toastError).toHaveBeenCalledWith("boom");
    });

    it("Dismiss writes nothing", async () => {
      suggestions.value = [force];
      await click(mountIt("forces"), "Dismiss");
      expect(mocks.dismiss).toHaveBeenCalledWith(force);
      expect(mocks.acceptForce).not.toHaveBeenCalled();
    });
  });
});

describe("CanonSuggestions lore", () => {
  const lore: LoreSuggestion = { title: "The Fall", kind: "history", passages: [{ title: "What everyone says", body: "A hundred years ago.", spot: null }, { title: "What was lost", body: "The recipes.", spot: { kind: "npc", id: "n1", name: "Miss Pellam" } }] };
  const draftTarget: Lore = { title: "The Fall", kind: null, entryId: null, text: "" };
  const splitTarget: Lore = { title: "The Fall", kind: null, entryId: "l1", text: "Some words." };

  it("a draft writes the entry and its passages only on Accept, and hands the new entry up", async () => {
    suggestions.value = [lore];
    mocks.loreDraft.mockResolvedValue("l9");
    const w = mountIt("lore", [], null, draftTarget);
    expect(mocks.loreDraft).not.toHaveBeenCalled();
    await click(w, "Accept");
    expect(mocks.loreDraft).toHaveBeenCalledWith(lore, expect.anything(), 0);
    expect(w.emitted("accepted")?.[0]).toEqual(["l9"]);
  });

  it("a split asks before it replaces the entry's passages, and replaces nothing when the DM says no", async () => {
    suggestions.value = [lore];
    passages.value = [{ id: "g1", entry_id: "l1", sort_order: 0 }, { id: "g2", entry_id: "l2", sort_order: 0 }];
    mocks.confirm.mockResolvedValue(false);
    const w = mountIt("lore", [], null, splitTarget);
    await click(w, "Accept");
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.loreSplit).not.toHaveBeenCalled();
  });

  it("a split replaces only this entry's passages once confirmed, never another entry's", async () => {
    suggestions.value = [lore];
    passages.value = [{ id: "g1", entry_id: "l1", sort_order: 0, told_at: null }, { id: "g2", entry_id: "l2", sort_order: 0, told_at: null }];
    mocks.loreSplit.mockResolvedValue(undefined);
    const w = mountIt("lore", [], null, splitTarget);
    await click(w, "Accept");
    expect(mocks.loreSplit).toHaveBeenCalledWith(lore, "l1", expect.anything(), [expect.objectContaining({ id: "g1" })], [expect.objectContaining({ id: "g1" })]);
  });

  // Bug caught: Split deleted every old passage, including ones already told to players and ones a clue points at.
  it("a split keeps a told passage and a clue's passage, replaces the rest, and says what stays", async () => {
    suggestions.value = [lore];
    passages.value = [
      { id: "told", entry_id: "l1", sort_order: 0, told_at: "2026-11-01T00:00:00Z" },
      { id: "clued", entry_id: "l1", sort_order: 1, told_at: null },
      { id: "free", entry_id: "l1", sort_order: 2, told_at: null },
    ];
    existingClues.value = [{ secret_id: "s1", passage_id: "clued" }];
    mocks.loreSplit.mockResolvedValue(undefined);
    await click(mountIt("lore", [], null, splitTarget), "Accept");
    expect(mocks.confirm.mock.calls[0][0]).toContain("2 passages stay");
    expect(mocks.loreSplit.mock.calls[0][4].map((p: { id: string }) => p.id)).toEqual(["free"]);
  });

  it("a split of an entry with no passages yet needs no confirm", async () => {
    suggestions.value = [lore];
    mocks.loreSplit.mockResolvedValue(undefined);
    const w = mountIt("lore", [], null, splitTarget);
    await click(w, "Accept");
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.loreSplit).toHaveBeenCalled();
  });

  it("a draft needs a title: the Draft button waits for one", async () => {
    const w = mountIt("lore", [], null, { ...draftTarget, title: "  " });
    await click(w, "Draft a lore entry");
    expect(w.findAll("button").find((b) => b.text() === "Draft")!.attributes("disabled")).toBeDefined();
  });

  it("sends the entry's own text with a split, and no text with a draft", async () => {
    mocks.suggest.mockResolvedValue(true);
    const split = mountIt("lore", [], null, splitTarget);
    await click(split, "Split into passages");
    await click(split, "Split");
    expect(mocks.suggest).toHaveBeenLastCalledWith("", { title: "The Fall", lore_kind: null, text: "Some words." });
    const draft = mountIt("lore", [], null, draftTarget);
    await click(draft, "Draft a lore entry");
    await click(draft, "Draft");
    expect(mocks.suggest).toHaveBeenLastCalledWith("", { title: "The Fall", lore_kind: null });
  });
});
