import { describe, expect, it } from "vitest";
import { resolveSuggestionTargets } from "./useNpcRelationshipSuggestions";

describe("resolveSuggestionTargets", () => {
  const npcs = [{ id: "n1", name: "Tilda Fenn" }];
  const factions = [{ id: "f1", name: "The Iron Concord" }];

  it("maps names to ids case-insensitively and drops unresolved ones", () => {
    const out = resolveSuggestionTargets(
      [
        { kind: "npc", target_name: "tilda fenn", relationship_type: "ally", notes: "" },
        { kind: "npc", target_name: "Gone", relationship_type: "ally", notes: "" },
        { kind: "faction", target_name: "The Iron Concord", role: "Spy", notes: "" },
        { kind: "faction", target_name: "Tilda Fenn", role: "Spy", notes: "" },
      ],
      npcs,
      factions,
    );
    expect(out.map((s) => s.target_id)).toEqual(["n1", "f1"]);
  });
});
