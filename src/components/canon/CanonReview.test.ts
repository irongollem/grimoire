import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref, toRaw } from "vue";
import type { ClueSuggestion, ForceSuggestion, LoreSuggestion, PremiseSuggestion, QuestionSuggestion, ReadFinding, SecretSuggestion, TruthSuggestion, ArcSuggestion, PeopleSuggestion, BackstorySuggestion, SpeciesSuggestion, HabitatSuggestion } from "@/ai/useCanonSuggestions";
import type { CanonEntry } from "@/types/canon.types";
import type { CanonSuggestionMode } from "@/ai/useCanonSuggestions";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createClue: vi.fn(),
  update: vi.fn(),
  nameKnower: vi.fn(),
  acceptForce: vi.fn(),
  loreDraft: vi.fn(),
  loreSplit: vi.fn(),
  keyed: vi.fn(),
  dismiss: vi.fn(),
  dismissAll: vi.fn(),
  confirm: vi.fn(),
  toastError: vi.fn(),
  acceptArc: vi.fn(),
  acceptPeople: vi.fn(),
  acceptBackstory: vi.fn(),
  acceptSpecies: vi.fn(),
  acceptHabitat: vi.fn(),
  trashEntry: vi.fn(),
  removeClue: vi.fn(),
}));
// The kept state the real `useCanonSuggestions` holds, in the same shape: a proposal is kept until its undo succeeds.
const keptRows = ref<{ suggestion: object; write: { undo: (() => Promise<void>) | null } }[]>([]);
const suggestions = ref<(PremiseSuggestion | TruthSuggestion | ClueSuggestion | QuestionSuggestion | ForceSuggestion | LoreSuggestion | SecretSuggestion | ReadFinding | ArcSuggestion | PeopleSuggestion | BackstorySuggestion | SpeciesSuggestion | HabitatSuggestion)[]>([]);
const setAside = ref<{ claim: string; reason: string }[]>([]);
const provenance = ref<{ generatorType: string } | null>({ generatorType: "canon_premise_suggestion" });
const hasResult = ref(false);
const generating = ref(false);
const failure = ref<string | null>(null);

vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCanonEntries: () => ({ data: ref([canonEntry({ id: "a", title: "The king is dead" }), canonEntry({ id: "b", title: "The king signs a decree" })]) }),
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
vi.mock("@/composables/canon/useCanonReviewAccept", () => ({
  useCanonReviewAccept: () => ({ acceptArc: mocks.acceptArc, acceptPeople: mocks.acceptPeople, acceptBackstory: mocks.acceptBackstory, acceptSpecies: mocks.acceptSpecies, acceptHabitat: mocks.acceptHabitat, trashEntry: mocks.trashEntry, removeClue: mocks.removeClue }),
}));
vi.mock("@/composables/canon/useKnownTo", () => ({ useKnownTo: () => ({ nameKnower: mocks.nameKnower }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/ai/useCanonSuggestions", () => ({
  useCanonSuggestions: (mode: string, scope?: string) => {
    mocks.keyed(mode, scope);
    return {
    suggestions,
    setAside,
    provenance,
    hasResult,
    isGenerating: generating,
    error: failure,
    dismiss: mocks.dismiss,
    dismissAll: mocks.dismissAll,
    isKept: (x: object) => keptRows.value.some((k) => toRaw(k.suggestion) === toRaw(x)),
    canUndo: (x: object) => keptRows.value.some((k) => toRaw(k.suggestion) === toRaw(x) && k.write.undo !== null),
    markKept: (x: object, write: { undo: (() => Promise<void>) | null }) => { keptRows.value = [...keptRows.value, { suggestion: toRaw(x), write }]; },
    undoKept: async (x: object) => {
      const found = keptRows.value.find((k) => toRaw(k.suggestion) === toRaw(x));
      await found?.write.undo?.();
      keptRows.value = keptRows.value.filter((k) => k !== found);
    },
    };
  },
}));

import CanonReview from "./CanonReview.vue";

const entry = (over: Partial<CanonEntry>): CanonEntry => canonEntry({ campaign_id: "c1", part: "premise", premise_kind: "theme", ...over });

type Lore = { title: string; kind: null; entryId: string | null; text: string };
function mountIt(mode: CanonSuggestionMode, entries: CanonEntry[] = [], secretId: string | null = null, lore: Lore | null = null, partyMemberId: string | null = null) {
  return mount(CanonReview, { props: { mode, entries, secretId, lore, partyMemberId }, global: { stubs: { CanonRef: true, RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } } } });
}
const click = async (w: ReturnType<typeof mountIt>, label: string) => {
  await w.findAll("button").find((b) => b.text() === label)!.trigger("click");
  await flushPromises();
};

beforeEach(() => {
  for (const m of [mocks.create, mocks.createClue, mocks.update, mocks.nameKnower, mocks.acceptForce, mocks.loreDraft, mocks.loreSplit, mocks.keyed, mocks.dismiss, mocks.dismissAll, mocks.confirm, mocks.toastError, mocks.acceptArc, mocks.acceptPeople, mocks.acceptBackstory, mocks.acceptSpecies, mocks.acceptHabitat, mocks.trashEntry, mocks.removeClue]) m.mockReset();
  keptRows.value = [];
  hasResult.value = false;
  generating.value = false;
  failure.value = null;
  mocks.create.mockResolvedValue({ id: "new1" });
  mocks.confirm.mockResolvedValue(true);
  mocks.acceptForce.mockResolvedValue("f1");
  mocks.loreDraft.mockResolvedValue("l1");
  mocks.trashEntry.mockResolvedValue(undefined);
  mocks.removeClue.mockResolvedValue(undefined);
  mocks.createClue.mockResolvedValue({ id: "clue1" });
  mocks.acceptArc.mockResolvedValue({ undo: async () => {} });
  mocks.acceptPeople.mockResolvedValue({ undo: async () => {} });
  mocks.acceptBackstory.mockResolvedValue({ undo: async () => {} });
  mocks.acceptSpecies.mockResolvedValue({ undo: async () => {} });
  mocks.acceptHabitat.mockResolvedValue({ undo: async () => {} });
  existingClues.value = [];
  passages.value = [];
  suggestions.value = [];
  setAside.value = [];
});

describe("CanonReview", () => {
  // Bug caught: accepting a suggested secret wrote only the secret (its clues lost), or put a clue on two places, or
  // placed an unplaced clue somewhere (a stale id carried over); the clues are the point of the suggestion.
  it("accepts a secret as the secret and its three clues, each on its own place, and opens the secret", async () => {
    suggestions.value = [{
      title: "The guildmaster is dead.",
      clues: [
        { title: "A fresh grave", spot: { kind: "location", id: "l1", name: "The Mint Fields" } },
        { title: "A letter in her hand", spot: { kind: "npc", id: "n1", name: "Sift" } },
        { title: "A rumour with no place", spot: null },
      ],
    }];
    mocks.create.mockResolvedValue({ id: "s-new" });
    const w = mountIt("secrets", [entry({ id: "s0", part: "secret", premise_kind: null }), entry({ id: "t0", part: "truth", premise_kind: null })]);
    await click(w, "Accept");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ part: "secret", title: "The guildmaster is dead.", sort_order: 1, ai_provenance: expect.anything() }));
    expect(mocks.createClue).toHaveBeenCalledTimes(3);
    const clues = mocks.createClue.mock.calls.map(([c]) => c);
    expect(clues[0]).toMatchObject({ secret_id: "s-new", title: "A fresh grave", sort_order: 0, location_id: "l1" });
    expect(clues[1]).toMatchObject({ secret_id: "s-new", sort_order: 1, npc_id: "n1" });
    expect(clues[2]).toMatchObject({ secret_id: "s-new", sort_order: 2 });
    for (const key of ["location_id", "npc_id", "quest_beat_id"]) expect(clues[2]).not.toHaveProperty(key);
    expect(clues[0]).not.toHaveProperty("npc_id");
    expect(w.emitted("accepted")?.[0]).toEqual(["s-new"]);
    expect(keptRows.value).toHaveLength(1);
  });

  // Bug caught: a clue that failed to save was swallowed, so the DM saw "accepted" on a secret missing its clues.
  it("tells the DM and keeps the proposal when a clue cannot be saved", async () => {
    const s: SecretSuggestion = { title: "A secret.", clues: [{ title: "A clue", spot: null }] };
    suggestions.value = [s];
    mocks.createClue.mockRejectedValue(new Error("clue refused"));
    const w = mountIt("secrets");
    await click(w, "Accept");
    expect(mocks.toastError).toHaveBeenCalledWith("clue refused");
    expect(keptRows.value).toEqual([]);
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
    expect(keptRows.value).toEqual([]);
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
    expect(keptRows.value).toEqual([]);
    expect(mocks.toastError).toHaveBeenCalledWith("boom");
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

    it("accepting hands the force, the run's provenance and the next place in the list to the writer, and dismisses it", async () => {
      suggestions.value = [force];
      await click(mountIt("forces", [entry({ part: "force", premise_kind: null }), entry({ id: "t", part: "truth", premise_kind: null })]), "Accept");
      expect(mocks.acceptForce).toHaveBeenCalledWith(force, { generatorType: "canon_premise_suggestion" }, 1);
      expect(keptRows.value.map((k) => k.suggestion)).toEqual([force]);
      // A force is never written as a question, which is what a suggestion with no mark and no spot would otherwise be.
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("keeps the proposal and tells the DM when the writing fails", async () => {
      mocks.acceptForce.mockRejectedValue(new Error("boom"));
      suggestions.value = [force];
      await click(mountIt("forces"), "Accept");
      expect(keptRows.value).toEqual([]);
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

describe("CanonReview lore", () => {
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

  // Bug caught: the split's proposals were read under the draft's key (or the reverse), so the Familiar's result for an
  // entry never showed on that entry.
  it("reads a draft under the new-entry key and a split under the entry's own key", () => {
    mountIt("lore", [], null, draftTarget);
    mountIt("lore", [], null, splitTarget);
    expect(mocks.keyed.mock.calls).toEqual([["lore", "new"], ["lore", "l1"]]);
  });
});

describe("CanonReview, what it shows", () => {
  // Bug caught: the review drew an empty frame (or a stray heading) before the Familiar had run, on every chapter.
  it("renders nothing when its key holds no result, no error and no run", () => {
    expect(mountIt("truths").html()).toBe("<!--v-if-->");
    expect(mountIt("read").html()).toBe("<!--v-if-->");
  });

  // Bug caught: a failed run left the DM looking at an unchanged chapter, with the reason only in the Familiar.
  it("shows a run in flight and its error, with no proposals", () => {
    generating.value = true;
    expect(mountIt("truths").get("[role=status]").text()).toContain("Reading your campaign for truths");
    generating.value = false;
    failure.value = "Needs the server";
    expect(mountIt("truths").text()).toContain("Needs the server");
  });

  // Bug caught: the clues review was keyed by mode alone, so one secret's clues were offered on every secret.
  it("keeps a secret's clues under that secret", () => {
    mountIt("clues", [], "s1");
    expect(mocks.keyed).toHaveBeenCalledWith("clues", "s1");
  });

  describe("the read", () => {
    // Bug caught: a finding without its links (the DM must hunt for the entries), or a link to the wrong URL shape.
    it("lists each finding with a link to every entry it names, by title", () => {
      hasResult.value = true;
      suggestions.value = [
        { kind: "contradiction", text: "He cannot be dead and sign.", entry_ids: ["a", "b"] },
        { kind: "loose_end", text: "A secret with no clue.", entry_ids: ["a"] },
      ] satisfies ReadFinding[];
      const w = mountIt("read");
      const rows = w.findAll("[data-testid=read-through-finding]");
      expect(rows).toHaveLength(2);
      expect(rows[0]!.text()).toContain("Contradiction");
      expect(rows[1]!.text()).toContain("Loose end");
      expect(rows[0]!.findAll("a").map((a) => [a.attributes("href"), a.text()])).toEqual([
        ["/canon?entry=a", "The king is dead"],
        ["/canon?entry=b", "The king signs a decree"],
      ]);
      expect(w.find("[data-testid=canon-proposal]").exists()).toBe(false);
    });

    // Bug caught: a clean read showed nothing at all, which reads as "never ran" or "broken".
    it("says so when a run found nothing, and Close clears the result", async () => {
      hasResult.value = true;
      const w = mountIt("read");
      expect(w.get("[data-testid=read-through-clear]").text()).toContain("Nothing contradicts");
      await click(w, "Close");
      expect(mocks.dismissAll).toHaveBeenCalled();
    });
  });

  // Bug caught: an arc, a people or a backstory passage rendered as a premise entry (no kind tag) or crashed the list.
  it("shows each new mode's proposal with its own words, and writes nothing until Accept", () => {
    suggestions.value = [{ name: "The Thaw", summary: "Winter ends", question: "Who lets it?", stakes: "The harvest", themeId: null }];
    const arcs = mountIt("arcs");
    expect(arcs.text()).toContain("An arc, planned");
    expect(arcs.text()).toContain("Asks: Who lets it?");
    suggestions.value = [{ kind: "library_species", recordId: "e", recordName: "Elf", name: "The Vael", percent: 30 }];
    expect(mountIt("peoples").text()).toContain("The Vael: 30%");
    suggestions.value = [{ title: "The fire", body: "She does not know who lit it." }];
    expect(mountIt("backstory", [], null, null, "pm1").text()).toContain("She does not know who lit it.");
    expect(mocks.acceptArc).not.toHaveBeenCalled();
  });

  // Bug caught: Accept on an arc, a people or a passage went down the premise path and wrote a premise entry.
  it("sends each new proposal to its own write, and keeps the proposal when the write says no", async () => {
    const arc: ArcSuggestion = { name: "The Thaw", summary: "s", question: null, stakes: null, themeId: "t1" };
    suggestions.value = [arc];
    await click(mountIt("arcs"), "Accept");
    expect(mocks.acceptArc).toHaveBeenCalledWith(arc);
    expect(keptRows.value.map((k) => k.suggestion)).toEqual([arc]);

    const people: PeopleSuggestion = { kind: "species", recordId: "s1", recordName: "Vell", name: null, percent: 40 };
    suggestions.value = [people];
    mocks.acceptPeople.mockResolvedValue(null);
    keptRows.value = [];
    await click(mountIt("peoples"), "Accept");
    expect(mocks.acceptPeople).toHaveBeenCalledWith(people);
    expect(keptRows.value).toEqual([]);

    const passage: BackstorySuggestion = { title: "The fire", body: "x" };
    suggestions.value = [passage];
    await click(mountIt("backstory", [], null, null, "pm1"), "Accept");
    expect(mocks.acceptBackstory).toHaveBeenCalledWith(passage, "pm1");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  // Bug caught: a species or habitat rendered as a premise entry (no tag) or its links lost their target words.
  it("shows a species with its habits, forms and links, and a habitat with each species and how common it is", () => {
    suggestions.value = [{
      name: "Marsh Heron", scientificName: null, kingdom: "animal", livesAs: "pairs", activity: "twilight", clade: { id: null, name: "Waders" }, description: "Grey and patient.",
      forms: [{ label: "Chick", domesticated: false }, { label: "Kept", domesticated: true }],
      links: [{ kind: "eats", toSpeciesId: null, toName: "Frog", toLabel: "Frog", note: null }, { kind: "shelters", toSpeciesId: null, toName: null, toLabel: null, note: null }],
    }];
    const species = mountIt("species").text();
    expect(species).toContain("A species");
    expect(species).toContain("Animal, lives in pairs, at twilight, of the Waders (new kin).");
    expect(species).toContain("Forms: Chick, Kept (kept).");
    expect(species).toContain("Links: eats Frog; shelters other animals.");
    suggestions.value = [{ name: "Salt Marsh", description: "Wet.", species: [{ speciesId: "s1", speciesName: "Heron", abundance: "very_rare" }, { speciesId: "s2", speciesName: "Frog", abundance: null }] }];
    const habitats = mountIt("habitats").text();
    expect(habitats).toContain("A habitat");
    expect(habitats).toContain("Lives here: Heron (very rare), Frog.");
  });

  // Bug caught: Accept on a species or a habitat went down the premise path, or a refused write still folded the proposal to Kept.
  it("sends a species and a habitat to their own writes, and keeps the proposal when the write says no", async () => {
    const species: SpeciesSuggestion = { name: "Heron", scientificName: null, kingdom: "animal", livesAs: null, activity: null, clade: null, description: "", forms: [], links: [] };
    suggestions.value = [species];
    await click(mountIt("species"), "Accept");
    expect(mocks.acceptSpecies).toHaveBeenCalledWith(species);
    expect(keptRows.value.map((k) => k.suggestion)).toEqual([species]);

    const habitat: HabitatSuggestion = { name: "Marsh", description: "", species: [] };
    suggestions.value = [habitat];
    mocks.acceptHabitat.mockResolvedValue(null);
    keptRows.value = [];
    await click(mountIt("habitats"), "Accept");
    expect(mocks.acceptHabitat).toHaveBeenCalledWith(habitat);
    expect(keptRows.value).toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  // Bug caught: the backstory review read the wrong key, so the Familiar's passages were never on screen.
  it("holds a backstory's proposals under the character", () => {
    mountIt("backstory", [], null, null, "pm1");
    expect(mocks.keyed).toHaveBeenCalledWith("backstory", "pm1");
  });
});

describe("CanonReview, kept rows (#1282)", () => {
  const buttons = (w: ReturnType<typeof mountIt>) => w.findAll("button").map((b) => b.text());

  // Bug caught: an accepted proposal kept its Accept and Dismiss (accept twice, a duplicate entry), or vanished so the DM
  // could not tell what was done from what still waits.
  it("folds an accepted proposal to a Kept row with Undo and no Accept or Dismiss, leaving the others pending", async () => {
    suggestions.value = [{ title: "The sea is salt", knowledge: "all", knowers: [] }, { title: "The king lies", knowledge: "all", knowers: [] }];
    mocks.create.mockResolvedValue({ id: "t1" });
    const w = mountIt("truths");
    await w.findAll("button").find((b) => b.text() === "Accept")!.trigger("click");
    await flushPromises();
    const kept = w.get('[data-testid="canon-kept"]');
    expect(kept.text()).toContain("Kept");
    expect(kept.text()).toContain("The sea is salt");
    expect(kept.findAll("button").map((b) => b.text())).toEqual(["Undo"]);
    expect(w.findAll('[data-testid="canon-proposal"]')).toHaveLength(1);
    expect(w.get('[data-testid="canon-proposal"]').text()).toContain("The king lies");
  });

  // Bug caught: Dismiss all wiped the kept rows too (dismissAll drops the whole result), so an accepted entry lost its Undo.
  it("Dismiss all removes only the pending proposals and hides once none are pending", async () => {
    const a: TruthSuggestion = { title: "Kept one", knowledge: "all", knowers: [] };
    const b: TruthSuggestion = { title: "Pending one", knowledge: "all", knowers: [] };
    suggestions.value = [a, b];
    const w = mountIt("truths");
    await w.findAll("button").find((x) => x.text() === "Accept")!.trigger("click");
    await flushPromises();
    await click(w, "Dismiss all");
    expect(mocks.dismiss.mock.calls.map(([x]) => x)).toEqual([b]);
    expect(mocks.dismissAll).not.toHaveBeenCalled();
    suggestions.value = [a];
    await flushPromises();
    expect(buttons(w)).not.toContain("Dismiss all");
    expect(w.get('[data-testid="canon-all-kept"]').text()).toContain("All kept");
  });

  // Bug caught: Dismiss all with nothing kept left the result (and its set-aside notes) on screen.
  it("Dismiss all with nothing kept drops the whole result", async () => {
    suggestions.value = [{ title: "T", knowledge: "all", knowers: [] }];
    await click(mountIt("truths"), "Dismiss all");
    expect(mocks.dismissAll).toHaveBeenCalled();
  });

  // Bug caught: undo trashed some other entry (or none), or left the row kept after it worked, so it could not be accepted again.
  it("Undo on a truth trashes exactly the entry that accept made and puts the proposal back to pending", async () => {
    suggestions.value = [{ title: "The sea is salt", knowledge: "all", knowers: [] }];
    mocks.create.mockResolvedValue({ id: "made-1" });
    const w = mountIt("truths", [entry({ id: "other", part: "truth", premise_kind: null })]);
    await click(w, "Accept");
    await click(w, "Undo");
    expect(mocks.trashEntry).toHaveBeenCalledExactlyOnceWith("made-1");
    expect(buttons(w)).toEqual(expect.arrayContaining(["Accept", "Dismiss"]));
    expect(w.find('[data-testid="canon-kept"]').exists()).toBe(false);
  });

  // Bug caught: undoing a replaced pitch trashed the entry (the DM's pitch gone) instead of writing the old words back.
  it("Undo on a replaced pitch writes the previous text and provenance back, never trashing the entry", async () => {
    const old = entry({ id: "p1", premise_kind: "pitch", body: "OLD-BODY", ai_provenance: null });
    suggestions.value = [{ kind: "pitch", text: "A drowned kingdom." }];
    const w = mountIt("premise", [old]);
    await click(w, "Accept");
    mocks.update.mockClear();
    await click(w, "Undo");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ id: "p1", patch: { body: "OLD-BODY", ai_provenance: null } });
    expect(mocks.trashEntry).not.toHaveBeenCalled();
  });

  // Bug caught: undoing a replaced voice put back the title but left the new accept's null body, so the old text was lost.
  it("Undo on a replaced voice restores its title and body", async () => {
    const old = entry({ id: "v1", premise_kind: "voice", title: "Gruff", body: "OLD-BODY", ai_provenance: null });
    suggestions.value = [{ kind: "voice", text: "Dry and warm." }];
    const w = mountIt("premise", [old]);
    await click(w, "Accept");
    mocks.update.mockClear();
    await click(w, "Undo");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ id: "v1", patch: { title: "Gruff", body: "OLD-BODY", ai_provenance: null } });
  });

  // Bug caught: a premise line filling an empty slot could not be undone, or undo trashed a different premise entry.
  it("Undo on a premise line that filled an empty slot trashes the new entry", async () => {
    suggestions.value = [{ kind: "theme", text: "Mercy" }];
    mocks.create.mockResolvedValue({ id: "theme-new" });
    const w = mountIt("premise", [entry({ id: "t0", premise_kind: "theme" })]);
    await click(w, "Accept");
    await click(w, "Undo");
    expect(mocks.trashEntry).toHaveBeenCalledExactlyOnceWith("theme-new");
  });

  // Bug caught: undoing a clue added to an existing secret trashed the secret instead of removing that one clue.
  it("Undo on a clue deletes that clue only", async () => {
    suggestions.value = [{ title: "A fresh grave", spot: { kind: "location", id: "l1", name: "Mint" } }];
    mocks.createClue.mockResolvedValue({ id: "clue-9" });
    const w = mountIt("clues", [], "s1");
    await click(w, "Accept");
    await click(w, "Undo");
    expect(mocks.removeClue).toHaveBeenCalledExactlyOnceWith("clue-9");
    expect(mocks.trashEntry).not.toHaveBeenCalled();
  });

  // Bug caught: undoing a secret removed its clues one by one (or left them) instead of trashing the secret they hang off.
  it("Undo on a secret and on a force trashes the entry each accept made", async () => {
    suggestions.value = [{ title: "A secret.", clues: [{ title: "c", spot: null }] }];
    mocks.create.mockResolvedValue({ id: "sec-1" });
    const w = mountIt("secrets");
    await click(w, "Accept");
    await click(w, "Undo");
    expect(mocks.trashEntry).toHaveBeenLastCalledWith("sec-1");
    expect(mocks.removeClue).not.toHaveBeenCalled();
    mocks.acceptForce.mockResolvedValue("force-7");
    suggestions.value = [{ title: "The Ferrymen", wants: "w", steps: ["a"], clockSize: 4, quests: [], who: null }];
    const f = mountIt("forces");
    await click(f, "Accept");
    await click(f, "Undo");
    expect(mocks.trashEntry).toHaveBeenLastCalledWith("force-7");
  });

  // Bug caught: a failed undo returned the row to pending although the entry was still there (a second Accept made a duplicate).
  it("a failed Undo tells the DM and leaves the row kept", async () => {
    suggestions.value = [{ title: "The sea is salt", knowledge: "all", knowers: [] }];
    mocks.create.mockResolvedValue({ id: "made-1" });
    mocks.trashEntry.mockRejectedValue(new Error("could not delete"));
    const w = mountIt("truths");
    await click(w, "Accept");
    await click(w, "Undo");
    expect(mocks.toastError).toHaveBeenCalledWith("could not delete");
    expect(w.find('[data-testid="canon-kept"]').exists()).toBe(true);
    expect(buttons(w)).not.toContain("Accept");
  });

  // Bug caught: a split offered Undo although its old passages are gone for good, so "undo" would have lost text silently.
  it("a split is Kept with no Undo", async () => {
    mocks.loreSplit.mockResolvedValue(undefined);
    suggestions.value = [{ title: "The Sinking", kind: "history", passages: [{ title: "p", body: "b", spot: null }] }];
    const w = mountIt("lore", [], null, { title: "The Sinking", kind: null, entryId: "e1", text: "words" });
    await click(w, "Accept");
    expect(w.get('[data-testid="canon-kept"]').text()).toContain("Kept");
    expect(buttons(w)).not.toContain("Undo");
  });

  // Bug caught: an arc, a people or a passage went Kept with the wrong undo wired, or none (their undo lives in the accept).
  it("an arc, a people and a passage take back through the undo their accept returned", async () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    for (const [mode, name, member] of [["arcs", "acceptArc", null], ["peoples", "acceptPeople", null], ["backstory", "acceptBackstory", "pm1"]] as const) {
      mocks[name].mockResolvedValue({ undo });
      suggestions.value = [mode === "arcs" ? { name: "A", summary: "s", question: null, stakes: null, themeId: null } : mode === "peoples" ? { kind: "species", recordId: "s", recordName: "V", name: null, percent: 5 } : { title: "t", body: "b" }];
      const w = mountIt(mode, [], null, null, member);
      await click(w, "Accept");
      await click(w, "Undo");
    }
    expect(undo).toHaveBeenCalledTimes(3);
  });
});
