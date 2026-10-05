import { describe, expect, it } from "vitest";
import type { EntityNote } from "@/types/faction.types";
import type { PlayerJournalEntry } from "./usePlayerJournal";
import { excerptOf, mergeRecentNotes } from "./useMyRecentNotes";

const doc = (text: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : undefined }] });

function en(o: Partial<EntityNote>): EntityNote {
  return {
    id: "e1",
    user_id: "me",
    campaign_id: "c",
    entity_type: "npc",
    entity_id: "n1",
    content: doc("Owes us a favour"),
    is_private: true,
    shared_with_dm: false,
    created_at: "2026-10-01",
    updated_at: "2026-10-01",
    ...o,
  };
}
function je(o: Partial<PlayerJournalEntry>): PlayerJournalEntry {
  return {
    id: "j1",
    user_id: "me",
    campaign_id: "c",
    title: "Session recap",
    content: doc("We fled the mine"),
    category: "session",
    tags: [],
    is_private: false,
    shared_with_dm: false,
    ref_type: null,
    ref_id: null,
    ref_label: null,
    sort_order: null,
    created_at: "2026-10-01",
    updated_at: "2026-10-01",
    ...o,
  } as PlayerJournalEntry;
}

describe("excerptOf", () => {
  it("keeps short text and cuts long text on a word boundary", () => {
    expect(excerptOf(doc("short"))).toBe("short");
    const out = excerptOf(doc("word ".repeat(60)), 120);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(121);
    expect(out).not.toMatch(/wor…$/);
  });
});

describe("mergeRecentNotes", () => {
  it("merges both sources newest first and limits", () => {
    const out = mergeRecentNotes(
      [en({ id: "e1", updated_at: "2026-10-03" }), en({ id: "e2", updated_at: "2026-10-01" })],
      [je({ id: "j1", updated_at: "2026-10-02" })],
      2,
    );
    expect(out.map((n) => n.id)).toEqual(["e1", "j1"]);
  });

  it("carries the subject of an entity note as a type and id for the row to resolve, never a name", () => {
    const [npc, member, odd] = mergeRecentNotes(
      [
        en({ id: "a", updated_at: "2026-10-03" }),
        en({ id: "b", entity_type: "party_member", entity_id: "pm1", updated_at: "2026-10-02" }),
        en({ id: "c", entity_type: "dragon", entity_id: "d1", updated_at: "2026-10-01" }),
      ],
      [],
      5,
    );
    expect(npc).toMatchObject({ source: "entity", entity: { type: "npc", id: "n1" } });
    expect(member).toMatchObject({ entity: { type: "player", id: "pm1" } });
    expect(odd).toMatchObject({ entity: { type: null, id: "d1" } });
    expect(npc).not.toHaveProperty("label");
  });

  it("routes quest notes and journal entries, maps visibility, titles the journal", () => {
    const out = mergeRecentNotes(
      [en({ id: "q", entity_type: "quest", entity_id: "q9", shared_with_dm: true, updated_at: "2026-10-04" })],
      [je({ id: "j", title: null, updated_at: "2026-10-03" }), je({ id: "jt", is_private: true, updated_at: "2026-10-02" })],
      5,
    );
    expect(out[0]).toMatchObject({ visibility: "dm", to: { name: "play-quest-detail", params: { id: "q9" } } });
    expect(out[1]).toMatchObject({ source: "journal" });
    expect(out[1]).toHaveProperty("label", expect.stringMatching(/^Journal · /));
    expect(out[1].to).toEqual({ name: "play-journal", query: { tab: "mine" } });
    expect(out[2]).toMatchObject({ label: "Session recap", visibility: "private" });
  });

  it("drops blank notes", () => {
    const out = mergeRecentNotes([en({ content: doc("") }), en({ id: "x", content: null })], [je({ content: "" })], 5);
    expect(out).toEqual([]);
  });
});
