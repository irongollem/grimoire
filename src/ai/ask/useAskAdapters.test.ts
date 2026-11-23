import { describe, expect, it, vi } from "vitest";

vi.mock("@/ai/ask/adapters/npcAskAdapter", () => ({ useNpcAskAdapter: () => ({ id: "npc", quote: vi.fn(), run: vi.fn() }) }));
vi.mock("@/ai/ask/adapters/monsterAskAdapter", () => ({ useMonsterAskAdapter: () => ({ id: "monster", quote: vi.fn(), run: vi.fn() }) }));

const { useAskAdapters } = await import("./useAskAdapters");

describe("useAskAdapters", () => {
  it("offers the NPC and monster generators, and nothing for one with no adapter yet", () => {
    const adapters = useAskAdapters();
    expect(adapters.adapterFor("npc")?.id).toBe("npc");
    expect(adapters.adapterFor("monster")?.id).toBe("monster");
    expect(adapters.adapterFor("item")).toBeUndefined();
  });
});
