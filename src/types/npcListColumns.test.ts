import { describe, it, expect } from "vitest";
import { NPC_LIST_COLUMNS, NPC_LIST_HEAVY_COLUMNS } from "./npc.types";

describe("NPC list columns (#999)", () => {
  it("never selects a prose column the list leaves out", () => {
    for (const heavy of NPC_LIST_HEAVY_COLUMNS) expect(NPC_LIST_COLUMNS).not.toContain(heavy);
  });

  it("selects each column once", () => {
    expect(new Set(NPC_LIST_COLUMNS).size).toBe(NPC_LIST_COLUMNS.length);
  });
});
