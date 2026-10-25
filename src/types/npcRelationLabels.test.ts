import { describe, expect, it } from "vitest";
import {
  NPC_RELATIONSHIP_FILTER_OPTIONS,
  NPC_RELATIONSHIP_TYPE_VAR,
  npcRelationLabel,
  npcRelationOptions,
} from "@/types/npc.types";

describe("directed relation wording", () => {
  it("says whose a directed tie is, and leaves a symmetric one plain", () => {
    expect(npcRelationLabel("subordinate", "Ulkora")).toBe("Ulkora's subordinate");
    expect(npcRelationLabel("mentor", "Ulkora")).toBe("Ulkora's mentor");
    expect(npcRelationLabel("friend", "Ulkora")).toBe("Friend");
    expect(npcRelationLabel("superior", null)).toBe("Superior");
  });

  it("words every picker option for the owner", () => {
    const options = new Map(npcRelationOptions("Ulkora"));
    expect(options.get("superior")).toBe("Ulkora's superior");
    expect(options.get("ally")).toBe("Ally");
  });

  it("offers a directed pair once in the filter, by its leading end", () => {
    const keys = NPC_RELATIONSHIP_FILTER_OPTIONS.map(([k]) => k);
    expect(keys).toContain("superior");
    expect(keys).not.toContain("subordinate");
    expect(keys).not.toContain("apprentice");
    expect(new Map(NPC_RELATIONSHIP_FILTER_OPTIONS).get("mentor")).toBe("Mentor / apprentice");
  });

  it("gives both ends of a pair one colour", () => {
    expect(NPC_RELATIONSHIP_TYPE_VAR.subordinate).toBe(NPC_RELATIONSHIP_TYPE_VAR.superior);
    expect(NPC_RELATIONSHIP_TYPE_VAR.apprentice).toBe(NPC_RELATIONSHIP_TYPE_VAR.mentor);
  });
});
