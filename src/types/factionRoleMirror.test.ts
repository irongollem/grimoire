import { describe, expect, it } from "vitest";
import { SUGGESTED_FACTION_ROLES } from "@edge-shared/npcRelationshipSuggestions.ts";
import { NPC_FACTION_ROLES } from "@/types/faction.types";

// Edge code cannot import from src/, so the suggester keeps its own copy.
describe("faction role mirror", () => {
  it("the suggester's faction roles equal NPC_FACTION_ROLES", () => {
    expect([...SUGGESTED_FACTION_ROLES]).toEqual([...NPC_FACTION_ROLES]);
  });
});
