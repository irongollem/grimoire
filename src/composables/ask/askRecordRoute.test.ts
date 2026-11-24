import { describe, expect, it } from "vitest";
import { askGeneratorList, askRecordRoute } from "./askRecordRoute";

describe("askRecordRoute", () => {
  // Bug caught: an item linked to /items (which is not a route; the Vault is /vault) so the link lands on a 404.
  it("opens an item in the Vault and a place in the Atlas", () => {
    expect(askRecordRoute({ type: "item", id: "i1" })).toBe("/vault/i1");
    expect(askRecordRoute({ type: "location", id: "l1" })).toBe("/locations?at=l1");
  });

  // Bug caught: a beat or room reference linked to a guessed address instead of drawn as plain text.
  it("has no page for a beat or a room", () => {
    expect(askRecordRoute({ type: "quest_beat", id: "b" })).toBeNull();
    expect(askRecordRoute({ type: "room", id: "r" })).toBeNull();
  });

  // Bug caught: the "may have been saved" card linking nowhere, or to a create page, instead of the list to check.
  it("names the list to check for a generator that saves records, and none for a voice line", () => {
    expect(askGeneratorList("encounter")).toBe("/encounters");
    expect(askGeneratorList("npc_voice")).toBeNull();
  });
});
