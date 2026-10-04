import { describe, expect, it } from "vitest";
import {
  MAX_NOTES_CHARS,
  NPC_RELATIONSHIP_TYPES,
  sanitizeSuggestions,
  type SuggestionContext,
} from "./npcRelationshipSuggestions";

const ctx: SuggestionContext = {
  sourceName: "Mara Voss",
  npcNames: ["Baelin Ironforge", "Mara Voss", "Tilda Fenn", "Old Corwin"],
  factionNames: ["The Iron Concord", "Dock Wardens"],
  existingNpcNames: ["Old Corwin"],
  existingFactionNames: ["Dock Wardens"],
};

describe("sanitizeSuggestions", () => {
  it("keeps valid npc and faction suggestions in candidate casing", () => {
    const out = sanitizeSuggestions(
      {
        suggestions: [
          { kind: "npc", target_name: "baelin ironforge", relationship_type: "rival", notes: "Old grudge." },
          { kind: "faction", target_name: "THE IRON CONCORD", role: "Informant", notes: "Sells secrets." },
        ],
      },
      ctx,
    );
    expect(out).toEqual([
      { kind: "npc", target_name: "Baelin Ironforge", relationship_type: "rival", notes: "Old grudge." },
      { kind: "faction", target_name: "The Iron Concord", role: "Informant", notes: "Sells secrets." },
    ]);
  });

  it("drops unknown names, self, already-related and duplicates", () => {
    const out = sanitizeSuggestions(
      {
        suggestions: [
          { kind: "npc", target_name: "Nobody Real", relationship_type: "ally", notes: "" },
          { kind: "npc", target_name: "Mara Voss", relationship_type: "ally", notes: "" },
          { kind: "npc", target_name: "Old Corwin", relationship_type: "ally", notes: "" },
          { kind: "faction", target_name: "Dock Wardens", role: "Guard", notes: "" },
          { kind: "npc", target_name: "Tilda Fenn", relationship_type: "friend", notes: "a" },
          { kind: "npc", target_name: "tilda fenn", relationship_type: "enemy", notes: "b" },
        ],
      },
      ctx,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ target_name: "Tilda Fenn", relationship_type: "friend" });
  });

  it("drops invalid relationship types and a type on the wrong kind", () => {
    const out = sanitizeSuggestions(
      [
        { kind: "npc", target_name: "Tilda Fenn", relationship_type: "bestie", notes: "" },
        { kind: "npc", target_name: "Baelin Ironforge", notes: "" },
        { kind: "faction", target_name: "Baelin Ironforge", role: "x", notes: "" },
      ],
      ctx,
    );
    expect(out).toEqual([]);
  });

  it("truncates notes and tolerates junk", () => {
    const out = sanitizeSuggestions(
      {
        suggestions: [
          "junk",
          null,
          { kind: "npc", target_name: "Tilda Fenn", relationship_type: "ally", notes: "x".repeat(500) },
        ],
      },
      ctx,
    );
    expect(out).toHaveLength(1);
    expect(out[0].notes.length).toBeLessThanOrEqual(MAX_NOTES_CHARS);
    expect(sanitizeSuggestions("nope", ctx)).toEqual([]);
    expect(sanitizeSuggestions({ suggestions: "no" }, ctx)).toEqual([]);
  });

  it("lists exactly the 15 relationship types", () => {
    expect(NPC_RELATIONSHIP_TYPES).toHaveLength(15);
  });
});
