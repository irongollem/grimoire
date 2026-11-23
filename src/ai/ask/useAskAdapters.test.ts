import { describe, expect, it, vi } from "vitest";

vi.mock("@/ai/ask/adapters/npcAskAdapter", () => ({ default: () => ({ id: "npc", quote: vi.fn(), run: vi.fn() }) }));
vi.mock("@/ai/ask/adapters/monsterAskAdapter", () => ({ default: () => ({ id: "monster", quote: vi.fn(), run: vi.fn() }) }));

const { useAskAdapters } = await import("./useAskAdapters");

describe("useAskAdapters", () => {
  it("finds each adapter file by name, and offers nothing for a generator with no adapter yet", () => {
    const adapters = useAskAdapters();
    expect(adapters.adapterFor("npc")?.id).toBe("npc");
    expect(adapters.adapterFor("monster")?.id).toBe("monster");
    expect(adapters.adapterFor("item")).toBeUndefined();
  });
});
