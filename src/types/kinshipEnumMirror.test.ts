import { describe, expect, it } from "vitest";
import { SUGGESTED_KIN_RELATIONS } from "@edge-shared/connectionSuggestions.ts";
import { KIN_RELATIONS } from "@/types/kinship.types";

// Edge code cannot import from src/, so the suggester keeps its own copy.
describe("kin relation mirror", () => {
  it("the suggester's kin relations equal KIN_RELATIONS", () => {
    expect([...SUGGESTED_KIN_RELATIONS]).toEqual([...KIN_RELATIONS]);
  });
});
