import { describe, expect, it } from "vitest";
import { hitToCandidate } from "./useImportLinkSearch";

const UUID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";

describe("hitToCandidate", () => {
  it("marks a deity hit as a deity even though its id is a uuid (not a campaign NPC)", () => {
    expect(hitToCandidate("deity", { id: UUID, name: "Moradin" }).source).toBe("deity");
  });

  it("a uuid row is the campaign's own, a text id is a library entry (app convention: library ids are text)", () => {
    expect(hitToCandidate("item", { id: UUID, name: "Pickaxe" }).source).toBe("campaign");
    expect(hitToCandidate("item", { id: "srd_armor_hide", name: "Hide armor" }).source).toBe("library");
  });

  it("carries the hit's detail, falls back to its descriptor, and is a hand-chosen match", () => {
    expect(hitToCandidate("npc", { id: UUID, name: "A", detail: "blacksmith", descriptor: "d" })).toMatchObject({
      detail: "blacksmith", matchKind: "chosen", distance: null, targetId: UUID, name: "A",
    });
    expect(hitToCandidate("npc", { id: UUID, name: "A", descriptor: "d" }).detail).toBe("d");
    expect(hitToCandidate("npc", { id: UUID, name: "A" }).detail).toBeNull();
  });
});
