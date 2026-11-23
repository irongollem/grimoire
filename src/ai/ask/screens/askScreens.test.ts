import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { AskProposal } from "@edge-shared/agent/askContract";
import { useAskPrefillStore } from "@/stores/ui/askPrefill";
import useQuestDesignerAskScreen from "./questDesignerAskScreen";
import useMapStyleAskScreen from "./mapStyleAskScreen";
import useComplicationAskScreen from "./complicationAskScreen";

const proposal = (generator: string, over: Partial<AskProposal> = {}): AskProposal => ({
  proposalId: "p1", generator, concept: "  a heist in the mint  ", inputs: {}, ...over,
});

describe("ask screens", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Bug caught: the Quest Designer opened empty, so the DM had to say it all again.
  it("the Quest Designer opens on /quests/new with the description waiting for it", () => {
    expect(useQuestDesignerAskScreen().route(proposal("quest_designer"))).toBe("/quests/new");
    expect(useAskPrefillStore().take("quest_designer")).toBe("a heist in the mint");
  });

  // Bug caught: the styler was opened for a place the model named wrongly, e.g. a quest id, and led to a 404 editor.
  it("the map styler goes to the target place's editor, and to the Cartographer when no place is named", () => {
    const target = { type: "location" as const, id: "loc1", name: "The Mint" };
    expect(useMapStyleAskScreen().route(proposal("map_style", { target }))).toBe("/locations/loc1/map");
    expect(useAskPrefillStore().take("map_style")).toBe("a heist in the mint");
    expect(useMapStyleAskScreen().route(proposal("map_style", { target: { type: "npc", id: "n1", name: "Mara" } }))).toBe("/cartographer");
    expect(useAskPrefillStore().take("map_style")).toBeNull();
  });

  // Bug caught: a complication was aimed at a record that is not a fight.
  it("the complication goes to the fight's Play screen, and to the encounters list when no fight is named", () => {
    const target = { type: "encounter" as const, id: "e1", name: "Bridge ambush" };
    expect(useComplicationAskScreen().route(proposal("complication", { target }))).toBe("/encounters/e1/run");
    expect(useAskPrefillStore().take("complication")).toBe("a heist in the mint");
    expect(useComplicationAskScreen().route(proposal("complication", { target: { type: "quest", id: "q1", name: "Q" } }))).toBe("/encounters");
    expect(useComplicationAskScreen().route(proposal("complication"))).toBe("/encounters");
    expect(useAskPrefillStore().take("complication")).toBeNull();
  });
});
