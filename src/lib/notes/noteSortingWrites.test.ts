import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm" }) }));

import { appendToBackstory, appendToDmNote, fetchNotesToSort, linkNoteToSession, removeFromSortingList, writeLoreEntry } from "./noteSortingWrites";

const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

beforeEach(() => fake.reset());

describe("writeLoreEntry", () => {
  it("files the note as a lore entry that keeps its text, its audience and its provenance", async () => {
    // Fails if the entry is made for nobody (or everybody) instead of the party members the note was shared with.
    await writeLoreEntry({
      campaign_id: "c1", title: "The Flood", content: doc("water"), player_visible_to: ["pm1"],
      ai_provenance: { model: "m" } as never,
    });
    expect(fake.rows("canon_entries")).toEqual([
      expect.objectContaining({ campaign_id: "c1", user_id: "dm", part: "lore", title: "The Flood", body: doc("water"), player_visible_to: ["pm1"], ai_provenance: { model: "m" } }),
    ]);
  });

  it("throws when the database refuses the entry, so the note is not deleted after it", async () => {
    fake.failNext("canon_entries", { message: "denied" });
    await expect(writeLoreEntry({ campaign_id: "c1", title: "x", content: null, player_visible_to: [], ai_provenance: null })).rejects.toThrow();
  });
});

describe("appendToBackstory", () => {
  it("adds the text after the character's own description", async () => {
    // Fails if the note's text replaces what the player wrote about their character.
    fake.seed("party_members", [{ id: "pm1", player_description: doc("born in Mere") }]);
    await appendToBackstory("pm1", doc("raised by wolves"));
    const [row] = fake.rows("party_members");
    expect(JSON.parse(row.player_description as string).content).toHaveLength(2);
  });

  it("refuses a description in an older format instead of overwriting it", async () => {
    fake.seed("party_members", [{ id: "pm1", player_description: "<p>old</p>" }]);
    await expect(appendToBackstory("pm1", doc("x"))).rejects.toThrow(/older format/);
    expect(fake.rows("party_members")[0].player_description).toBe("<p>old</p>");
  });
});

describe("appendToDmNote", () => {
  it("adds to the DM's own private note on the character, and not to another DM's or a player's", async () => {
    // Fails if the text lands on someone else's note, or on a note that is not the DM's private one.
    fake.seed("entity_notes", [
      { id: "mine", entity_type: "party_member", entity_id: "pm1", user_id: "dm", is_private: true, written_as_dm: true, content: doc("a"), created_at: "1" },
      { id: "theirs", entity_type: "party_member", entity_id: "pm1", user_id: "co", is_private: true, written_as_dm: true, content: doc("b"), created_at: "0" },
    ]);
    await appendToDmNote("pm1", "c1", doc("c"));
    const mine = fake.rows("entity_notes").find((r) => r.id === "mine");
    const theirs = fake.rows("entity_notes").find((r) => r.id === "theirs");
    expect(JSON.parse(mine?.content as string).content).toHaveLength(2);
    expect(theirs?.content).toBe(doc("b"));
  });

  it("starts a private DM note when there is none", async () => {
    await appendToDmNote("pm1", "c1", doc("c"));
    expect(fake.rows("entity_notes")).toEqual([
      expect.objectContaining({ entity_type: "party_member", entity_id: "pm1", campaign_id: "c1", user_id: "dm", is_private: true, shared_with_dm: false, written_as_dm: true, content: doc("c") }),
    ]);
  });
});

describe("the list", () => {
  it("reads only this campaign's rows and drops one whose note is gone", async () => {
    // Fails if another campaign's notes appear on this list.
    fake.seed("note_sorting", [
      { note_id: "a", campaign_id: "c1", was: "lore", created_at: "1", notes: { id: "a", title: "A" } },
      { note_id: "b", campaign_id: "c2", was: "lore", created_at: "2", notes: { id: "b", title: "B" } },
      { note_id: "c", campaign_id: "c1", was: "session", created_at: "3", notes: null },
    ]);
    expect((await fetchNotesToSort("c1")).map((r) => r.note.id)).toEqual(["a"]);
  });

  it("removes a note's row, and links a note to a session", async () => {
    fake.seed("note_sorting", [{ note_id: "a", campaign_id: "c1", was: "lore" }]);
    fake.seed("notes", [{ id: "a", session_id: null }]);
    await linkNoteToSession("a", "s1");
    await removeFromSortingList("a");
    expect(fake.rows("notes")[0].session_id).toBe("s1");
    expect(fake.rows("note_sorting")).toEqual([]);
  });
});
