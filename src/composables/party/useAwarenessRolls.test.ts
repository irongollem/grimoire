// @vitest-environment jsdom
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const gates = vi.hoisted(() => ({ isDM: true, ruleOn: true }));
// The party, the toast and the campaign's class rows, for the "use" mutation.
const use = vi.hoisted(() => ({
  party: [] as unknown[],
  info: vi.fn(),
  /** Whether the class rows have landed; `settled()` lands them, as a real wait would. */
  rowsLoaded: false,
}));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ get isDM() { return gates.isDM; } }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/rules/useOptionalRules", () => ({
  useIsRuleEnabled: () => ({ get value() { return gates.ruleOn; } }),
}));
vi.mock("@/composables/party/useActiveParty", () => ({ useActiveParty: () => ({ data: { get value() { return use.party; } } }) }));
vi.mock("@/composables/party/useJackOfAllTrades", () => ({
  useCampaignJackOfAllTrades: () => ({
    jackFor: () => (use.rowsLoaded ? "any_check" : "none"),
    settled: () => { use.rowsLoaded = true; return Promise.resolve(); },
  }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ info: use.info, error: vi.fn(), fromError: () => "" }) }));

import { useAwarenessRolls, useUseAwarenessRolls } from "./useAwarenessRolls";

const row = (id: string, member: string, campaign: string) => ({
  id, party_member_id: member, campaign_id: campaign, d20: 10, d20_second: 4,
  last_used_d20: null, last_used_d20_second: null, last_used_at: null, rolled_at: "", created_at: "", updated_at: "",
});

async function mountRolls() {
  let result!: ReturnType<typeof useAwarenessRolls>;
  mount(
    defineComponent({
      setup() {
        result = useAwarenessRolls();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  await flushPromises();
  return result;
}

describe("useAwarenessRolls", () => {
  beforeEach(() => {
    fake.reset();
    gates.isDM = true;
    gates.ruleOn = true;
    fake.seed("awareness_rolls", [row("r1", "m1", "c1"), row("r2", "m2", "other")]);
  });

  it("sends no read for a player, so a player's client never asks for the DM's secret rolls", async () => {
    gates.isDM = false;
    await mountRolls();
    expect(fake.calls.filter((c) => c.target === "awareness_rolls")).toEqual([]);
  });

  it("sends no read while the rule is off", async () => {
    gates.ruleOn = false;
    await mountRolls();
    expect(fake.calls.filter((c) => c.target === "awareness_rolls")).toEqual([]);
  });

  it("returns only this campaign's rolls, not another campaign's row the DM can also see", async () => {
    const { rolls } = await mountRolls();
    expect([...(rolls.value ?? new Map()).keys()]).toEqual(["m1"]);
  });
});

describe("useUseAwarenessRolls", () => {
  beforeEach(() => {
    fake.reset();
    use.info.mockReset();
    use.rowsLoaded = false;
    // A 2014 Bard 6: WIS 13 (+1), PB 3, no Perception proficiency.
    use.party = [{
      id: "m1", name: "Toddy", str: 10, dex: 10, con: 10, int: 10, wis: 13, cha: 10,
      proficiency_bonus: 3, skill_proficiencies: {}, conditions: [], ruleset: "2014",
    }];
    fake.onRpc("use_awareness_rolls", () => [
      { member_id: "m1", used_d20: 12, used_d20_second: 3, new_d20: 9, new_d20_second: 9 },
    ]);
  });

  it("waits for the class rows, so the notice does not report a Bard's roll short", async () => {
    // #1147 review: "Use all awareness" pressed before the rows land. d20 12 + WIS 1 + half of PB 3 = 14.
    let spend!: ReturnType<typeof useUseAwarenessRolls>;
    mount(
      defineComponent({ setup() { spend = useUseAwarenessRolls(); return () => h("div"); } }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
    );
    await spend.mutateAsync(["m1"]);
    await flushPromises();
    expect(use.info).toHaveBeenCalledWith("Awareness used: Toddy 14", expect.any(Number));
  });
});
