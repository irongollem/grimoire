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

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ get isDM() { return gates.isDM; } }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/rules/useOptionalRules", () => ({
  useIsRuleEnabled: () => ({ get value() { return gates.ruleOn; } }),
}));
vi.mock("@/composables/party/useActiveParty", () => ({ useActiveParty: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ info: vi.fn(), error: vi.fn(), fromError: () => "" }) }));

import { useAwarenessRolls } from "./useAwarenessRolls";

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
