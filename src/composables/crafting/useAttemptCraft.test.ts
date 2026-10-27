import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const promptRoll = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) }, getCurrentUser: vi.fn() }));
vi.mock("@/composables/dice/usePromptedRoll", () => ({ usePromptedRoll: () => ({ promptRoll }) }));
vi.mock("@tanstack/vue-query", async (orig) => ({
  ...(await orig<typeof import("@tanstack/vue-query")>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (o: { mutationFn: (p: unknown) => Promise<unknown> }) => ({ mutateAsync: o.mutationFn }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({}) }));
vi.mock("@/composables/rules/useRuleset", () => ({ useRuleset: () => ({}) }));

import { useAttemptCraft } from "./useCrafting";

function roll(natural: number, total: number) {
  promptRoll.mockResolvedValue({ total, breakdown: [{ val: natural, dropped: false }] });
}

function params(over: Record<string, unknown> = {}) {
  return {
    recipe: { dc: 12, campaign_id: "c" },
    outputs: [{ item_id: "dagger", library_item_id: null, quantity: 1 }],
    outputItemNames: { dagger: "Iron Dagger" },
    ingredientConsumption: [{ id: "r1", qty: 2 }, { id: "r2", qty: 1 }],
    primaryConsumption: [{ id: "r1", qty: 2 }],
    primaryInventoryItem: { id: "r1", item_id: "iron", library_item_id: null, name: "Iron Ingot", carried_by: "m", campaign_id: "c" },
    modifierBonuses: [],
    abilityMod: 0,
    profBonus: 0,
    hasTools: true,
    partyMemberId: "m",
    ...over,
  };
}

async function run(p: ReturnType<typeof params>) {
  const { mutateAsync } = useAttemptCraft() as unknown as { mutateAsync: (p: unknown) => Promise<{ outcome: string }> };
  return mutateAsync(p);
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null });
});

describe("useAttemptCraft", () => {
  it("degrades the primary ingredient on a failure and spends nothing", async () => {
    roll(8, 8);
    expect((await run(params())).outcome).toBe("fail");
    expect(rpc).toHaveBeenCalledWith("craft_apply", expect.objectContaining({ p_outcome: "fail", p_ingredients: null, p_degrade: { id: "r1", qty: 2 } }));
  });

  it("makes no request on a failure when the recipe consumes nothing", async () => {
    roll(8, 8);
    await run(params({ primaryInventoryItem: null, primaryConsumption: [], ingredientConsumption: [] }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("makes a plain success standard and a high roll Fine", async () => {
    roll(14, 14);
    await run(params());
    expect(rpc.mock.calls[0][1].p_success_rows[0]).not.toHaveProperty("quality");
    expect(rpc.mock.calls[0][1].p_degrade).toBeNull();
    rpc.mockClear();
    roll(20, 22);
    await run(params());
    expect(rpc.mock.calls[0][1].p_success_rows[0].quality).toBe("fine");
  });

  it("returns the wreckage under the plain name on a critical failure", async () => {
    roll(1, 1);
    expect((await run(params())).outcome).toBe("ruin");
    const args = rpc.mock.calls[0][1];
    expect(args.p_ingredients).toEqual([{ id: "r1", qty: 2 }]);
    expect(args.p_ruined_row.name).toBe("Iron Ingot");
    expect(args.p_degrade).toBeNull();
  });

  // context/features/items-spells-crafting.md "The attempt": success is total >= DC, a plain fail
  // misses by less than 5, ruin is a natural 1 or a miss of 5 or more. Recipe DC is 12 here.
  it.each([
    ["meeting the DC exactly", 12, 12, "success"],
    ["missing by 1", 11, 11, "fail"],
    ["missing by 4", 8, 8, "fail"],
    ["missing by 5", 7, 7, "ruin"],
    ["a natural 1 that still totals above the DC", 1, 25, "ruin"],
    ["a natural 2 that totals above the DC", 2, 25, "success"],
  ])("resolves %s as %s", async (_label, natural, total, outcome) => {
    roll(natural, total);
    expect((await run(params())).outcome).toBe(outcome);
  });

  it("rolls with disadvantage and adds ability, proficiency and every bonus once, when the tools are missing", async () => {
    roll(15, 15);
    const result = await run(params({ hasTools: false, abilityMod: 3, profBonus: 2, modifierBonuses: [1, -2] }));
    expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ mode: "disadvantage", modifier: 4 }));
    expect(result).toMatchObject({ hasDisadvantage: true });
  });

  it("rolls normally with the tools in the pack", async () => {
    roll(15, 15);
    const result = await run(params({ hasTools: true }));
    expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ mode: "normal" }));
    expect(result).toMatchObject({ hasDisadvantage: false });
  });

  it("writes nothing when the player cancels the roll", async () => {
    promptRoll.mockResolvedValue(null);
    await expect(run(params())).rejects.toThrow("Roll cancelled");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("raises craft_apply's refusal instead of reporting a craft that did not happen", async () => {
    roll(15, 15);
    rpc.mockResolvedValue({ error: new Error("craft_apply refused") });
    await expect(run(params())).rejects.toThrow("craft_apply refused");
  });

  it("leaves no wreckage row on a plain failure, and makes no output on a ruin", async () => {
    roll(8, 8);
    await run(params());
    expect(rpc.mock.calls[0][1].p_ruined_row).toBeNull();
    rpc.mockClear();
    roll(1, 1);
    await run(params());
    expect(rpc.mock.calls[0][1].p_success_rows).toEqual([]);
  });

  it("returns no wreckage when a ruin consumed nothing", async () => {
    roll(1, 1);
    await run(params({ primaryInventoryItem: null, primaryConsumption: [], ingredientConsumption: [] }));
    expect(rpc.mock.calls[0][1].p_ruined_row).toBeNull();
  });
});
