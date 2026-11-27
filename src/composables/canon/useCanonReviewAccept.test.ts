import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const m = vi.hoisted(() => ({ addArc: vi.fn(), removeArc: vi.fn(), addPeople: vi.fn(), removePeople: vi.fn(), openBackstory: vi.fn(), createPassage: vi.fn(), deletePassage: vi.fn(), deleteClue: vi.fn(), trash: vi.fn(), invalidate: vi.fn(),
  addClade: vi.fn(), removeClade: vi.fn(), addSpecies: vi.fn(), updateSpecies: vi.fn(), removeSpecies: vi.fn(), addForm: vi.fn(), addLink: vi.fn(),
  insertHabitat: vi.fn(), updateHabitat: vi.fn(), deleteHabitat: vi.fn(), insertHabitatSpecies: vi.fn() }));
const arcs = ref<{ id: string }[]>([]);
const passages = ref<{ entry_id: string; sort_order: number }[]>([]);

vi.mock("@/composables/canon/useCanonArcs", () => ({
  useCanonArcActions: () => ({ add: { mutateAsync: m.addArc }, remove: { mutateAsync: m.removeArc } }),
  useCanonArcs: () => ({ data: arcs }),
}));
vi.mock("@/composables/canon/useCampaignPeoples", () => ({ usePeoplesEditing: () => ({ addPeopleAsync: m.addPeople, removePeopleAsync: m.removePeople }) }));
vi.mock("@/composables/canon/useBackstory", () => ({ useOpenBackstory: () => ({ mutateAsync: m.openBackstory }) }));
vi.mock("@/composables/canon/useCanonPassages", () => ({
  useCanonPassages: () => ({ data: passages }),
  useCreateCanonPassage: () => ({ mutateAsync: m.createPassage }),
  useDeleteCanonPassage: () => ({ mutateAsync: m.deletePassage }),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({ CANON_KEY: "canon", trashCanonEntry: m.trash }));
vi.mock("@/composables/canon/useCanonClues", () => ({ useDeleteCanonClue: () => ({ mutateAsync: m.deleteClue }) }));
vi.mock("@/composables/canon/useCampaignSpecies", () => ({
  useSpeciesEditing: () => ({ addClade: m.addClade, removeClade: m.removeClade, addSpecies: m.addSpecies, updateSpecies: m.updateSpecies, removeSpecies: m.removeSpecies, addForm: m.addForm, addLink: m.addLink }),
}));
vi.mock("@/composables/canon/useCampaignHabitats", () => ({
  insertHabitat: m.insertHabitat, updateHabitat: m.updateHabitat, deleteHabitat: m.deleteHabitat, insertHabitatSpecies: m.insertHabitatSpecies,
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ invalidateQueries: m.invalidate }) }));

const { useCanonReviewAccept, resetAcceptedSpecies } = await import("./useCanonReviewAccept");

const make = () => useCanonReviewAccept({ mode: () => "arcs", provenance: () => ({ generatorType: "canon_arc_suggestion" }) as never });

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  arcs.value = [{ id: "a1" }, { id: "a2" }];
  passages.value = [];
  m.addArc.mockResolvedValue({ id: "arc-new" });
  m.addPeople.mockResolvedValue("people-new");
  m.createPassage.mockResolvedValue({ id: "passage-new" });
  m.trash.mockResolvedValue("trash-row");
  resetAcceptedSpecies();
  m.addSpecies.mockImplementation(async (name: string) => `id-${name}`);
  m.updateSpecies.mockResolvedValue(undefined);
  m.addForm.mockResolvedValue("form");
  m.addLink.mockResolvedValue(undefined);
  m.addClade.mockResolvedValue("clade-new");
  m.insertHabitat.mockResolvedValue("hab-new");
});

describe("useCanonReviewAccept", () => {
  // Bug caught: an accepted arc came in running (it would start narrowing Tonight at once) or on top of the others.
  it("writes an accepted arc as planned, after the last one, with its question, stakes and theme", async () => {
    await make().acceptArc({ name: "The Thaw", summary: "Winter ends", question: "Who lets it?", stakes: null, themeId: "t1" });
    expect(m.addArc).toHaveBeenCalledWith({ name: "The Thaw", summary: "Winter ends", question: "Who lets it?", stakes: null, theme_id: "t1", status: "planned", sort_order: 2 });
  });

  // Bug caught: a shared book's species was written as the DM's own (a uuid column given a text id) or the culture name was lost.
  it("writes a people against the right record kind with its culture name and share", async () => {
    const { acceptPeople } = make();
    await acceptPeople({ kind: "library_species", recordId: "elf", recordName: "Elf", name: "The Vael", percent: 30 });
    await acceptPeople({ kind: "species", recordId: "uuid-1", recordName: "Vell", name: null, percent: 10 });
    expect(m.addPeople.mock.calls).toEqual([
      [{ kind: "species", recordId: "elf", fromLibrary: true, percent: 30, name: "The Vael" }],
      [{ kind: "species", recordId: "uuid-1", fromLibrary: false, percent: 10, name: null }],
    ]);
  });

  // Bug caught: a refused share (the hundred-percent rule) looked accepted, so the proposal vanished unwritten.
  it("answers null when the people could not be written", async () => {
    m.addPeople.mockRejectedValue(new Error("23514"));
    expect(await make().acceptPeople({ kind: "species", recordId: "u", recordName: "V", name: null, percent: 5 })).toBeNull();
  });

  // Bug caught: a passage was written before the backstory existed (no entry to hold it) or at the front, ahead of the player's own.
  it("opens the backstory first and writes the passage at the end, untold and the DM's", async () => {
    m.openBackstory.mockResolvedValue("e1");
    passages.value = [{ entry_id: "e1", sort_order: 0 }, { entry_id: "e1", sort_order: 4 }, { entry_id: "other", sort_order: 9 }];
    await make().acceptBackstory({ title: "The fire", body: "One.\n\nTwo." }, "pm1");
    expect(m.openBackstory).toHaveBeenCalledWith("pm1");
    const written = m.createPassage.mock.calls[0]![0];
    expect(written).toMatchObject({ entry_id: "e1", title: "The fire", sort_order: 5, ai_provenance: { generatorType: "canon_arc_suggestion" } });
    expect(written).not.toHaveProperty("player_visible_to");
    expect(m.openBackstory.mock.invocationCallOrder[0]).toBeLessThan(m.createPassage.mock.invocationCallOrder[0]!);
  });

  // Bug caught: undoing an arc deleted some other arc (the last in the list, say) or did nothing.
  it("undoes an arc by deleting exactly the arc it made", async () => {
    const done = await make().acceptArc({ name: "The Thaw", summary: "s", question: null, stakes: null, themeId: null });
    await done!.undo!();
    expect(m.removeArc).toHaveBeenCalledExactlyOnceWith("arc-new");
  });

  // Bug caught: undoing a people removed a different people of the same species, or reported accepted for a refused share.
  it("undoes a people by removing the row it wrote", async () => {
    const who = { kind: "species", recordId: "u", recordName: "V", name: null, percent: 5 } as const;
    const done = await make().acceptPeople(who);
    await done!.undo!();
    expect(m.removePeople).toHaveBeenCalledExactlyOnceWith("people-new");
  });

  // Bug caught: undoing a backstory passage deleted the backstory's other passages, or its entry.
  it("undoes a backstory passage by deleting that passage only", async () => {
    m.openBackstory.mockResolvedValue("e1");
    const done = await make().acceptBackstory({ title: "The fire", body: "One." }, "pm1");
    await done!.undo!();
    expect(m.deletePassage).toHaveBeenCalledExactlyOnceWith("passage-new");
  });

  // Bug caught: undoing an entry hard-deleted it with its ties orphaned, or left the Canon showing it.
  it("trashes an entry through the Canon's own trash and refreshes the Canon", async () => {
    await make().trashEntry("entry-1");
    expect(m.trash).toHaveBeenCalledExactlyOnceWith("entry-1");
    expect(m.invalidate).toHaveBeenCalledWith({ queryKey: ["canon"] });
  });

  // Bug caught: a failed trash still refreshed as if it worked and resolved, so the row went back to pending with the entry still there.
  it("rejects when the trash fails, so the review keeps the row kept", async () => {
    m.trash.mockRejectedValue(new Error("nope"));
    await expect(make().trashEntry("entry-1")).rejects.toThrow("nope");
  });

  // Bug caught: undoing a clue went to the trash of the whole secret, or deleted a different clue.
  it("removes a clue by its own id", async () => {
    await make().removeClue("clue-1");
    expect(m.deleteClue).toHaveBeenCalledExactlyOnceWith("clue-1");
  });
});

const species = (over: Partial<Parameters<ReturnType<typeof make>["acceptSpecies"]>[0]> = {}) => ({
  name: "Heron", scientificName: null, kingdom: "animal" as const, livesAs: null, activity: null, clade: null,
  description: "", forms: [], links: [], ...over,
});

describe("accepting a species", () => {
  // Bug caught: a species with no form of its own came in with nothing the habitats could put on a roll.
  it("writes the species, its fields and a bare Adult form when it has none", async () => {
    await make().acceptSpecies(species({ kingdom: "plant", livesAs: "colony", description: "Tall.\n\nGrey." }));
    expect(m.addSpecies).toHaveBeenCalledWith("Heron");
    const [id, patch] = m.updateSpecies.mock.calls[0]!;
    expect(id).toBe("id-Heron");
    expect(patch).toMatchObject({ kingdom: "plant", livesAs: "colony", cladeId: null });
    // The description goes in as the rich document, one paragraph per blank line.
    expect(JSON.parse(patch.description).content).toHaveLength(2);
    expect(m.addForm).toHaveBeenCalledExactlyOnceWith("id-Heron", { label: "Adult", domesticated: false });
  });

  // Bug caught: the clade was written after the species (so the species had no clade to point at) or an existing clade was made again.
  it("makes a new clade first and points the species at it, but never makes an existing one", async () => {
    await make().acceptSpecies(species({ clade: { id: null, name: "Herons" } }));
    expect(m.addClade).toHaveBeenCalledExactlyOnceWith("Herons", null);
    expect(m.addClade.mock.invocationCallOrder[0]).toBeLessThan(m.addSpecies.mock.invocationCallOrder[0]!);
    expect(m.updateSpecies.mock.calls[0]![1]).toMatchObject({ cladeId: "clade-new" });
    m.addClade.mockClear();
    await make().acceptSpecies(species({ name: "Egret", clade: { id: "cl-1", name: "Waders" } }));
    expect(m.addClade).not.toHaveBeenCalled();
    expect(m.updateSpecies.mock.calls[1]![1]).toMatchObject({ cladeId: "cl-1" });
  });

  // Bug caught: undo left the new clade behind, or deleted a clade the DM already had.
  it("undoes by removing the species, and the clade only when this accept made it", async () => {
    const made = await make().acceptSpecies(species({ clade: { id: null, name: "Herons" } }));
    await made!.undo!();
    expect(m.removeSpecies).toHaveBeenCalledExactlyOnceWith("id-Heron");
    expect(m.removeClade).toHaveBeenCalledExactlyOnceWith("clade-new");
    m.removeClade.mockClear();
    const existing = await make().acceptSpecies(species({ name: "Egret", clade: { id: "cl-1", name: "Waders" } }));
    await existing!.undo!();
    expect(m.removeClade).not.toHaveBeenCalled();
  });

  // Bug caught: a species whose form failed stayed half-written (and its proposal vanished as if kept).
  it("takes the species back out and answers null when a write fails", async () => {
    m.addForm.mockResolvedValue(null);
    expect(await make().acceptSpecies(species({ clade: { id: null, name: "Herons" } }))).toBeNull();
    expect(m.removeSpecies).toHaveBeenCalledWith("id-Heron");
    expect(m.removeClade).toHaveBeenCalledWith("clade-new");
  });

  // Bug caught: a species whose fields were refused (the toast already shown) stayed in the guide bare while its proposal vanished.
  it("takes the species back out and answers null when its fields are refused", async () => {
    m.updateSpecies.mockResolvedValue(null);
    expect(await make().acceptSpecies(species())).toBeNull();
    expect(m.removeSpecies).toHaveBeenCalledExactlyOnceWith("id-Heron");
  });

  // Bug caught: a link was written to the id of a species the DM had since undone, a foreign key refusal.
  it("does not link to a target that was accepted and then undone", async () => {
    const { acceptSpecies } = make();
    const frog = await acceptSpecies(species({ name: "Frog" }));
    await frog!.undo!();
    await acceptSpecies(species({ links: [{ kind: "eats", toSpeciesId: null, toName: "Frog", toLabel: "Frog", note: null }] }));
    expect(m.addLink).not.toHaveBeenCalled();
  });

  // Bug caught: a link to a species of the same answer was written at once with an id that did not exist yet, or never written at all.
  it("writes a link to another species of the answer only once both are accepted, in either order", async () => {
    const { acceptSpecies } = make();
    const heron = species({ links: [{ kind: "eats" as const, toSpeciesId: null, toName: "Frog", toLabel: "Frog", note: "mostly" }, { kind: "competes" as const, toSpeciesId: "sp-fox", toName: null, toLabel: "Red Fox", note: null }] });
    await acceptSpecies(heron);
    // Only the link to the existing fox is written; the frog is not in the guide yet.
    expect(m.addLink.mock.calls).toEqual([[{ fromSpeciesId: "id-Heron", kind: "competes", toSpeciesId: "sp-fox", note: null }]]);
    await acceptSpecies(species({ name: "Frog" }));
    expect(m.addLink).toHaveBeenLastCalledWith({ fromSpeciesId: "id-Heron", kind: "eats", toSpeciesId: "id-Frog", note: "mostly" });
    // The other order: the target is accepted first, so the link is written at once.
    await acceptSpecies(species({ name: "Newt" }));
    await acceptSpecies(species({ name: "Owl", links: [{ kind: "eats", toSpeciesId: null, toName: "Newt", toLabel: "Newt", note: null }] }));
    expect(m.addLink).toHaveBeenLastCalledWith({ fromSpeciesId: "id-Owl", kind: "eats", toSpeciesId: "id-Newt", note: null });
  });

  // Bug caught: a link waiting on an undone species was written later against a species that no longer exists.
  it("forgets the links of a species that was undone", async () => {
    const { acceptSpecies } = make();
    const heron = await acceptSpecies(species({ links: [{ kind: "eats", toSpeciesId: null, toName: "Frog", toLabel: "Frog", note: null }] }));
    await heron!.undo!();
    m.addLink.mockClear();
    await acceptSpecies(species({ name: "Frog" }));
    expect(m.addLink).not.toHaveBeenCalled();
  });
});

describe("accepting a habitat", () => {
  const habitat = { name: "Salt Marsh", description: "Wet.", species: [{ speciesId: "sp-a", speciesName: "A", abundance: "common" as const }, { speciesId: "sp-b", speciesName: "B", abundance: null }] };

  // Bug caught: a species was put in a habitat without its abundance, so every one looked equally common to the roll.
  it("writes the habitat, its description and each species with its abundance", async () => {
    await make().acceptHabitat(habitat);
    expect(m.insertHabitat).toHaveBeenCalledExactlyOnceWith("c1", "Salt Marsh");
    expect(m.updateHabitat).toHaveBeenCalledWith("hab-new", { description: expect.stringContaining("Wet.") });
    expect(m.insertHabitatSpecies.mock.calls).toEqual([["c1", "hab-new", "sp-a", "common"], ["c1", "hab-new", "sp-b", null]]);
  });

  // Bug caught: a habitat with no description wrote an empty rich document over the column.
  it("writes no description when the habitat has none", async () => {
    await make().acceptHabitat({ ...habitat, description: "" });
    expect(m.updateHabitat).not.toHaveBeenCalled();
  });

  // Bug caught: a species that could not be added left an empty habitat behind while the proposal stayed to be accepted again.
  it("takes the habitat back out and rethrows when a species cannot be added", async () => {
    m.insertHabitatSpecies.mockRejectedValueOnce(new Error("refused"));
    await expect(make().acceptHabitat(habitat)).rejects.toThrow("refused");
    expect(m.deleteHabitat).toHaveBeenCalledExactlyOnceWith("hab-new");
  });

  // Bug caught: undo deleted a different habitat, or left this one (with its species rows) in the Canon.
  it("undoes by deleting exactly the habitat it made and refreshing", async () => {
    const done = await make().acceptHabitat(habitat);
    m.invalidate.mockClear();
    await done!.undo!();
    expect(m.deleteHabitat).toHaveBeenCalledExactlyOnceWith("hab-new");
    expect(m.invalidate).toHaveBeenCalledWith({ queryKey: ["canon"] });
  });
});
