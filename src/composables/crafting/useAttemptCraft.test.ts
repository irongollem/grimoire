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
});
