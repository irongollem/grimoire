import { describe, expect, it } from "vitest";
import { giftReceived } from "./gift";

const none = { companion_id: null, inventory_item_id: null };

describe("giftReceived", () => {
  it("sends an item to the pack, not to the company", () => {
    const got = giftReceived({ label: "A silver whistle", ref: { kind: "item", id: "w" } }, { ...none, inventory_item_id: "i1" }, "Chicory");
    expect(got).toEqual({ text: "A silver whistle is in Chicory's pack.", to: "/play/inventory", link: "See the pack" });
  });

  it("says an NPC joins the company, and a creature becomes theirs", () => {
    expect(giftReceived({ label: "Bram", ref: { kind: "npc", id: "n" } }, { ...none, companion_id: "c1" }, "Chicory")?.text)
      .toBe("Bram joins Chicory's company.");
    expect(giftReceived({ label: "Cat", ref: { kind: "monster", id: "m" } }, { ...none, companion_id: "c1" }, "Chicory")?.text)
      .toBe("Cat is Chicory's now.");
  });

  it("claims nothing when the database gave nothing: a plain option, or a reward taken back", () => {
    expect(giftReceived({ label: "A smooth rock", ref: null }, none, "Chicory")).toBeNull();
    expect(giftReceived({ label: "Cat", ref: { kind: "monster", id: "m" } }, none, "Chicory")).toBeNull();
  });
});
