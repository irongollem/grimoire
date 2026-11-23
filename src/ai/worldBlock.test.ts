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

  // Bug: a failed peoples read was treated as "no peoples", and the generators silently went back to humans.
  it("throws when the peoples cannot be read", async () => {
    fake.failNext("campaign_peoples_named", { message: "boom" });
    await expect(fetchWorldBlock("c1")).rejects.toMatchObject({ message: "boom" });
  });
});
