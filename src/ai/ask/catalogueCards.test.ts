import { describe, expect, it } from "vitest";
import { ASK_GENERATORS, askGenerator } from "@edge-shared/agent/askContract";
import { formRows } from "./askForm";

const CATALOGUE = ["monster", "item", "spell", "faction", "location", "deity", "species", "background", "class_feature", "house_rule"] as const;

describe("the catalogue generators' cards (#1270)", () => {
  // Bug caught: a generator whose button opens a card with no box to describe the thing in, so Create could never be pressed.
  it("opens each with a concept box worded for it", () => {
    for (const id of CATALOGUE) {
      const concept = askGenerator(id)?.concept;
      expect(concept?.required, id).toBe(true);
      expect(concept?.max, id).toBe(id === "monster" ? 2000 : 1000);
      expect(concept?.placeholder.length, id).toBeGreaterThan(20);
    }
  });

  // Bug caught: an input with no label, which the form would show as its key ("faction type") instead of the DM's word.
  it("labels every input", () => {
    for (const id of CATALOGUE) {
      for (const [key, schema] of Object.entries(askGenerator(id)?.inputs ?? {})) {
        if (schema.type === "links") continue;
        expect(schema.label, `${id}.${key}`).toBeTruthy();
      }
    }
  });

  // Bug caught: the panels opened with the picture on; a card that opened with it off would stop charging for art the DM expected.
  it("opens with the picture on wherever the generator paints one", () => {
    for (const id of CATALOGUE) {
      const generator = ASK_GENERATORS.find((g) => g.id === id);
      expect(generator?.opened?.image === true, id).toBe("image" in (generator?.inputs ?? {}));
    }
  });

  // Bug caught: leader, headquarters and ties spread over six controls, the clutter the fold exists to remove.
  it("folds the faction's leader and headquarters, and the place's whereabouts, into one row each", () => {
    const faction = askGenerator("faction");
    const location = askGenerator("location");
    if (!faction || !location) throw new Error("catalogue generators exist");
    const factionGroup = formRows(faction, {}).find((r) => r.kind === "group");
    expect(factionGroup).toMatchObject({ name: "Who leads it, where" });
    expect(factionGroup?.kind === "group" && factionGroup.members.map((m) => m.key)).toEqual(["leader_npc_id", "leader_name", "headquarters_id", "headquarters_name", "links"]);
    const locationGroup = formRows(location, {}).find((r) => r.kind === "group");
    expect(locationGroup?.kind === "group" && locationGroup.members.map((m) => m.key)).toEqual(["parent_id", "keeper_npc_id", "links"]);
  });
});
