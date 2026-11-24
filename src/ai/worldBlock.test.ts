import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { fetchWorldBlock, requireWorld } from "./worldBlock";
import { worldBlockText } from "@edge-shared/worldBlock.ts";

describe("requireWorld", () => {
  it("refuses a missing block loudly instead of reading it as an empty world", () => {
    expect(() => requireWorld(null)).toThrow(/world block was not loaded/);
  });
});

describe("fetchWorldBlock", () => {
  beforeEach(() => {
    fake.reset();
    fake.seed("campaigns", [{ id: "c1", setting: "Sothery" }, { id: "c2", setting: "Elsewhere" }]);
  });

  // Bug: the peoples were read for every campaign the caller may see, so another world's elves reached this world's
  // generators; or they were read from a column that no longer exists and the whole block failed.
  it("tells the section this campaign's peoples from the view, in the DM's order", async () => {
    fake.seed("campaign_peoples_named", [
      { campaign_id: "c1", name: "Human", percent: 15, sort_order: 2 },
      { campaign_id: "c1", name: "Elf", percent: 80, sort_order: 1 },
      { campaign_id: "c2", name: "Orc", percent: 100, sort_order: 0 },
    ]);
    const text = worldBlockText(await fetchWorldBlock("c1"));
    expect(text).toContain("## Peoples of the world\nElf 80%, Human 15%, anyone else 5%\n");
    expect(text).not.toContain("Orc");
  });

  // Bug: a habitat's creatures were read for every campaign, a creature this reader cannot name reached a generator as
  // "null", or a place without a name was written into the line.
  it("tells the section this campaign's habitats with their places and creatures, leaving out a creature it cannot name", async () => {
    fake.seed("campaign_habitats", [
      { id: "h1", campaign_id: "c1", name: "Salt marsh", sort_order: 0 },
      { id: "h2", campaign_id: "c2", name: "Elsewhere desert", sort_order: 0 },
    ]);
    fake.seed("campaign_habitat_places", [
      { habitat_id: "h1", campaign_id: "c1", location: { name: "the Marsh" } },
      { habitat_id: "h2", campaign_id: "c2", location: { name: "the Dunes" } },
    ]);
    fake.seed("campaign_habitat_life_named", [
      { habitat_id: "h1", campaign_id: "c1", name: "Marsh eel", percent: 40, sort_order: 1 },
      { habitat_id: "h1", campaign_id: "c1", name: null, percent: 30, sort_order: 2 },
      { habitat_id: "h2", campaign_id: "c2", name: "Scorpion", percent: 90, sort_order: 1 },
    ]);
    const text = worldBlockText(await fetchWorldBlock("c1"));
    expect(text).toContain("## Life of the world\nSalt marsh (the Marsh): Marsh eel 40%, anything else 60%\n");
    expect(text).not.toContain("Scorpion");
    expect(text).not.toContain("null");
  });

  it("adds no Life of the world section when no habitat is described", async () => {
    expect(worldBlockText(await fetchWorldBlock("c1"))).not.toContain("Life of the world");
  });

  // Bug: a failed habitat read was treated as "no ecology".
  it("throws when the habitats cannot be read", async () => {
    fake.failNext("campaign_habitat_life_named", { message: "boom" });
    await expect(fetchWorldBlock("c1")).rejects.toMatchObject({ message: "boom" });
  });

  // Bug: a failed peoples read was treated as "no peoples", and the generators silently went back to humans.
  it("throws when the peoples cannot be read", async () => {
    fake.failNext("campaign_peoples_named", { message: "boom" });
    await expect(fetchWorldBlock("c1")).rejects.toMatchObject({ message: "boom" });
  });

  // Bug: a pitch's @mention stored no name, so the DM's own local-key generators read the world without it.
  it("names a mention in the pitch from this campaign's NPCs", async () => {
    const npc = "11111111-1111-4111-8111-111111111111";
    const body = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Ruled by " }, { type: "entityMention", attrs: { id: npc, entityType: "npc" } }, { type: "text", text: "." }] }],
    });
    fake.seed("canon_entries", [{ campaign_id: "c1", part: "premise", premise_kind: "pitch", knowledge: null, title: "", body, sort_order: 0 }]);
    fake.seed("npcs", [{ id: npc, campaign_id: "c1", name: "Maren Voss" }]);
    expect(worldBlockText(await fetchWorldBlock("c1"))).toContain("Ruled by Maren Voss.");
  });
});
