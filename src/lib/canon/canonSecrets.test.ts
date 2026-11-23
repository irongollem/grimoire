import { describe, expect, it } from "vitest";
import { clueTally, passageClue, secretState } from "./canonSecrets";
import type { CanonClue, CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const secret = (over: Partial<CanonEntry> = {}): CanonEntry => canonEntry({ id: "s1", part: "secret", title: "Sift is the guild master's daughter.", ...over });
const clue = (over: Partial<CanonClue> = {}): CanonClue => ({
  id: "k1", user_id: "u", campaign_id: "c", secret_id: "s1", title: "A locket", sort_order: 0, location_id: null, npc_id: null,
  quest_beat_id: null, found_at: null, found_session_id: null, passage_id: null, ai_provenance: null, created_at: "", updated_at: "", ...over,
});

describe("secretState", () => {
  it("is hidden while no clue is found, even with clues placed", () => {
    expect(secretState(secret(), [clue(), clue({ id: "k2" })])).toBe("hidden");
  });

  it("is partly known once any clue is found, so the DM sees the party closing in", () => {
    expect(secretState(secret(), [clue({ found_at: "2026-11-18T20:00:00Z" }), clue({ id: "k2" })])).toBe("partly");
  });

  it("stays partly known with every clue found: the last step is the DM's button, so players never learn it by accident", () => {
    expect(secretState(secret(), [clue({ found_at: "2026-11-18T20:00:00Z" })])).toBe("partly");
  });

  it("is revealed only when the DM has revealed it, whatever the clues say", () => {
    expect(secretState(secret({ revealed_at: "2026-11-02T20:00:00Z" }), [])).toBe("revealed");
  });
});

describe("clueTally", () => {
  it("counts found against placed", () => {
    expect(clueTally([clue({ found_at: "x" }), clue({ id: "k2" }), clue({ id: "k3" })])).toBe("1 of 3 clues found");
  });

  it("says so when a secret has no clues at all, rather than '0 of 0'", () => {
    expect(clueTally([])).toBe("No clues yet");
  });
});

describe("passageClue", () => {
  const passage = { id: "g1", title: "  What was under the chapel ", told_at: null, told_session_id: null };

  it("files the clue under the passage's heading, pointing at the passage and lying nowhere of its own", () => {
    expect(passageClue(passage, "s1", 2)).toEqual({ secret_id: "s1", passage_id: "g1", title: "What was under the chapel", sort_order: 2 });
  });

  // Bug caught: a passage with no heading filed a clue with an empty title, which the secret lists as a blank row.
  it("names a clue from an untitled passage", () => {
    expect(passageClue({ ...passage, title: " " }, "s1", 0).title).toBe("A lore passage");
  });

  // Bug caught: the database finds a passage's clues only at the moment it is told, so a passage the party had already
  // heard became a clue that stayed "not found" for good.
  it("files the clue already found when the passage was told before it became a clue", () => {
    const told = passageClue({ ...passage, told_at: "2026-11-02T10:00:00Z", told_session_id: "ses1" }, "s1", 0);
    expect(told.found_at).toBe("2026-11-02T10:00:00Z");
    expect(told.found_session_id).toBe("ses1");
  });
});
