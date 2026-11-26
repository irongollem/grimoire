import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const m = vi.hoisted(() => ({ addArc: vi.fn(), removeArc: vi.fn(), addPeople: vi.fn(), removePeople: vi.fn(), openBackstory: vi.fn(), createPassage: vi.fn(), deletePassage: vi.fn(), deleteClue: vi.fn(), trash: vi.fn(), invalidate: vi.fn() }));
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
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ invalidateQueries: m.invalidate }) }));

const { useCanonReviewAccept } = await import("./useCanonReviewAccept");

const make = () => useCanonReviewAccept({ mode: () => "arcs", provenance: () => ({ generatorType: "canon_arc_suggestion" }) as never });

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  arcs.value = [{ id: "a1" }, { id: "a2" }];
  passages.value = [];
  m.addArc.mockResolvedValue({ id: "arc-new" });
  m.addPeople.mockResolvedValue("people-new");
  m.createPassage.mockResolvedValue({ id: "passage-new" });
  m.trash.mockResolvedValue("trash-row");
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
