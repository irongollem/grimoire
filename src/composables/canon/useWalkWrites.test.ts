import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));
vi.mock("@/lib/canon/queueCanonEmbedding", () => ({ queueCanonEmbedding: vi.fn() }));

import { linesOf, writeWalk, type WalkWriteContext } from "./useWalkWrites";
import { WALK_STEPS, type WalkStepId, type WalkStopRef } from "@/lib/canon/canonWalk";
import type { CanonEntry } from "@/types/canon.types";

const stop = (step: WalkStepId, over: Partial<WalkStopRef> = {}): WalkStopRef => ({ step, memberId: null, memberName: null, ...over });
const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const entry = (over: Partial<CanonEntry>): CanonEntry => ({ id: "e", part: "truth", premise_kind: null, title: "", body: null, party_member_id: null, ...over }) as CanonEntry;
const openBackstory = vi.fn(async () => "made-entry");
const addSpecies = vi.fn<(name: string) => Promise<string | null>>(async (name) => `species-${name}`);
const addHabitat = vi.fn(async (_campaignId: string, name: string) => `habitat-${name}`);
const ctx = (over: Partial<WalkWriteContext> = {}): WalkWriteContext => ({ campaignId: "c1", entries: [], arcCount: 0, openBackstory, addSpecies, addHabitat, ...over });

beforeEach(() => {
  fake.reset();
  openBackstory.mockClear();
  addSpecies.mockClear();
  addHabitat.mockClear();
});

describe("linesOf", () => {
  // Bug caught: a typed list ("- a", "* b") becoming entries that begin with the marker, and blank lines becoming empty entries.
  it("drops blank lines and list markers", () => {
    expect(linesOf("- Debts\n\n  * The sea\n• Kindness\n")).toEqual(["Debts", "The sea", "Kindness"]);
  });
});

describe("writeWalk", () => {
  // Bug caught: the pitch written as plain text in the body column (the editor reads Tiptap JSON) or in the title.
  it("writes the pitch as a Tiptap body", async () => {
    await writeWalk(ctx(), stop("pitch"), "A drowned kingdom");
    const [row] = fake.rows("canon_entries");
    expect(row).toMatchObject({ part: "premise", premise_kind: "pitch", campaign_id: "c1" });
    expect(String(row?.body)).toContain("A drowned kingdom");
    expect(String(row?.body)).toContain('"type":"doc"');
  });

  // Bug caught: the walk overwriting a pitch the DM had already written, with no word asked.
  it("keeps a written pitch unless told to replace it", async () => {
    const written = entry({ id: "p1", part: "premise", premise_kind: "pitch", body: doc("Mine") });
    fake.seed("canon_entries", [{ id: "p1", campaign_id: "c1", body: written.body }]);
    await expect(writeWalk(ctx({ entries: [written] }), stop("pitch"), "New words")).rejects.toThrow(/already written/);
    expect(fake.rows("canon_entries")[0]?.body).toBe(written.body);
    await writeWalk(ctx({ entries: [written] }), stop("pitch"), "New words", { replace: true });
    expect(String(fake.rows("canon_entries")[0]?.body)).toContain("New words");
  });

  // Bug caught: an emptied pitch (created blank by "Write the pitch") being left blank while a second pitch is made beside it.
  it("fills an empty pitch entry instead of making a second", async () => {
    const blank = entry({ id: "p1", part: "premise", premise_kind: "pitch", body: null });
    fake.seed("canon_entries", [{ id: "p1", campaign_id: "c1", body: null }]);
    await writeWalk(ctx({ entries: [blank] }), stop("pitch"), "Words");
    expect(fake.rows("canon_entries")).toHaveLength(1);
    expect(String(fake.rows("canon_entries")[0]?.body)).toContain("Words");
  });

  // Bug caught: voice text written to the body column, where the voice field never looks (PremiseTextField reads the title).
  it("writes the voice into its title", async () => {
    await writeWalk(ctx(), stop("voice"), "Dry and warm");
    expect(fake.rows("canon_entries")[0]).toMatchObject({ part: "premise", premise_kind: "voice", title: "Dry and warm" });
  });

  // Bug caught: a multi-line answer becoming one theme with newlines in it, or sort order restarting at 0 beside existing themes.
  it("makes one theme per line, after the ones already there", async () => {
    const existing = entry({ id: "t0", part: "premise", premise_kind: "theme", title: "Old" });
    await writeWalk(ctx({ entries: [existing] }), stop("themes"), "Debts\nThe sea");
    expect(fake.rows("canon_entries").map((r) => [r.premise_kind, r.title, r.sort_order])).toEqual([["theme", "Debts", 1], ["theme", "The sea", 2]]);
  });

  // Bug caught: every line becoming a line (a veil never written), or the veil: prefix left in the text.
  it("writes a line, and a veil only when the line starts with veil:", async () => {
    await writeWalk(ctx(), stop("lines"), "No harm to children\nVeil: Torture is skipped past");
    expect(fake.rows("canon_entries").map((r) => [r.premise_kind, r.title])).toEqual([["line", "No harm to children"], ["veil", "Torture is skipped past"]]);
  });

  // Bug caught: a truth the DM states being made known to some or to no one, so players never read it.
  it("writes each truth known to all, titled by its line", async () => {
    await writeWalk(ctx(), stop("truths"), "The sea is rising\nNo one has seen a dragon");
    expect(fake.rows("canon_entries").map((r) => [r.part, r.knowledge, r.title])).toEqual([
      ["truth", "all", "The sea is rising"],
      ["truth", "all", "No one has seen a dragon"],
    ]);
  });

  // Bug caught: forces, secrets, questions and lore all landing in one part (the part chosen from the wrong step).
  it.each([["forces", "force"], ["secrets", "secret"], ["questions", "question"], ["lore", "lore"]] as const)("writes %s as %s entries", async (step, part) => {
    await writeWalk(ctx(), stop(step), "One thing");
    expect(fake.rows("canon_entries")[0]).toMatchObject({ part, title: "One thing" });
  });

  // Bug caught: all the arcs in one line becoming one arc, or the new arcs ordered before the existing ones.
  it("makes one arc per line, ordered after the existing arcs", async () => {
    await writeWalk(ctx({ arcCount: 2 }), stop("arcs"), "Arrival\nThe lamps go out");
    expect(fake.rows("canon_arcs").map((r) => [r.name, r.sort_order])).toEqual([["Arrival", 2], ["The lamps go out", 3]]);
  });

  // Bug caught: the DM's notes written as told (the player reads them at once) or on the wrong character's entry.
  it("writes a character's notes as one untold DM passage on their backstory", async () => {
    const back = entry({ id: "ba", part: "backstory", party_member_id: "a" });
    await writeWalk(ctx({ entries: [back] }), stop("backstories", { memberId: "a", memberName: "Ada" }), "Left the salt works");
    const [row] = fake.rows("canon_lore_passages");
    expect(row).toMatchObject({ entry_id: "ba", title: "Notes", user_id: "dm-1", campaign_id: "c1", player_visible_to: [] });
    expect(row?.told_at ?? null).toBeNull();
    expect(String(row?.body)).toContain("Left the salt works");
    expect(openBackstory).not.toHaveBeenCalled();
  });

  // Bug caught: a character with no backstory entry yet losing the note (nowhere to put it) instead of opening one.
  it("opens the backstory entry first when the character has none", async () => {
    await writeWalk(ctx(), stop("backstories", { memberId: "a", memberName: "Ada" }), "Notes here");
    expect(openBackstory).toHaveBeenCalledWith("a");
    expect(fake.rows("canon_lore_passages")[0]).toMatchObject({ entry_id: "made-entry" });
  });

  // Bug caught: an empty answer writing an empty entry.
  it("refuses an empty answer and writes nothing", async () => {
    await expect(writeWalk(ctx(), stop("truths"), "  \n ")).rejects.toThrow(/few words/);
    expect(fake.rows("canon_entries")).toHaveLength(0);
  });

  // Bug caught: the step table saying a step can be written when the writer has no way to (a Write it myself button that
  // always fails), or the writer taking a step the table says is the chapter's.
  it.each(WALK_STEPS.map((s) => [s.id, s.canWrite] as const))("%s: the writer agrees with canWrite (%s)", async (step, canWrite) => {
    const attempt = writeWalk(ctx(), stop(step, step === "backstories" ? { memberId: "a", memberName: "Ada" } : {}), "Something");
    if (canWrite) await expect(attempt).resolves.toBeUndefined();
    else await expect(attempt).rejects.toThrow(/chapter/);
  });

  // Bug caught: a pasted list becoming one species named with every line, or a list marker left in the name.
  it("adds one species per line, in order", async () => {
    await writeWalk(ctx(), stop("species"), "- Marsh heron\n\nSmoked eel");
    expect(addSpecies.mock.calls.map(([name]) => name)).toEqual(["Marsh heron", "Smoked eel"]);
  });

  // Bug caught: a refused species (the composable answers null and only toasts) reported as written, so the block says
  // "Written into your canon" over nothing, and the lines after it still being attempted.
  it("fails the block when a species is refused, and stops there", async () => {
    addSpecies.mockResolvedValueOnce(null);
    await expect(writeWalk(ctx(), stop("species"), "Heron\nEel")).rejects.toThrow(/"Heron" could not be added/);
    expect(addSpecies).toHaveBeenCalledTimes(1);
  });

  // Bug caught: habitats written into the wrong campaign, or a line left joined to the next.
  it("adds one habitat per line to the campaign", async () => {
    await writeWalk(ctx(), stop("habitats"), "Salt marsh\nChalk downs");
    expect(addHabitat.mock.calls).toEqual([["c1", "Salt marsh"], ["c1", "Chalk downs"]]);
  });

  // Bug caught: a failed insert reported as saved (the error dropped).
  it("throws a write's error", async () => {
    fake.failNext("canon_entries", { message: "boom" });
    await expect(writeWalk(ctx(), stop("truths"), "A truth")).rejects.toMatchObject({ message: "boom" });
  });
});
