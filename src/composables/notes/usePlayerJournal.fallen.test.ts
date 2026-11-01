import { describe, expect, it } from "vitest";
import { groupCharacterNotes, withoutFallenCharacterNotes, type PlayerJournalEntry } from "./usePlayerJournal";
import type { CharacterMemorial } from "@/types/memorial.types";

const note = (id: string, category: PlayerJournalEntry["category"], party_member_id: string | null): PlayerJournalEntry =>
  ({ id, category, party_member_id, title: id, content: "", user_id: "u", campaign_id: "c", tags: [] }) as unknown as PlayerJournalEntry;
const memorial = (party_member_id: string, restored_at: string | null): CharacterMemorial =>
  ({ party_member_id, restored_at }) as unknown as CharacterMemorial;

// Decision (maintainer, 1 Nov 2026): a dead character's Character notes leave the live journal.
describe("withoutFallenCharacterNotes", () => {
  const entries = [
    note("dead-char", "character", "dead"),
    note("live-char", "character", "live"),
    note("dead-clue", "clue", "dead"),
    note("unlinked-char", "character", null),
  ];

  it("hides a Character note linked to a fallen character and keeps every other note", () => {
    const ids = withoutFallenCharacterNotes(entries, [memorial("dead", null)]).map((e) => e.id);
    expect(ids).toEqual(["live-char", "dead-clue", "unlinked-char"]);
  });

  it("shows the notes again once the character is restored", () => {
    const ids = withoutFallenCharacterNotes(entries, [memorial("dead", "2026-11-01")]).map((e) => e.id);
    expect(ids).toContain("dead-char");
  });

  it("hides nothing while memorials have not loaded", () => {
    expect(withoutFallenCharacterNotes(entries, undefined)).toHaveLength(4);
  });
});

describe("groupCharacterNotes", () => {
  it("groups Character notes by their character and drops other categories and unlinked notes", () => {
    const g = groupCharacterNotes([note("a", "character", "x"), note("b", "character", "y"), note("c", "clue", "x"), note("d", "character", null)]);
    expect([...g.keys()].sort()).toEqual(["x", "y"]);
    expect(g.get("x")?.map((e) => e.id)).toEqual(["a"]);
  });
});
